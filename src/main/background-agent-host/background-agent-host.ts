import type {
  BackgroundAgentFeedbackType,
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'
import { isBackgroundAgentFeedbackType } from '../../../background-agent/core/feedback/feedback-policy'
import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import { BackgroundAgentStore } from './background-agent-store'
import { RuntimeWebResearchClient } from './background-agent-research-client'
import { debugLog } from '../app/debug-log'
import { BackgroundAgentRefreshRunner } from './background-agent-refresh-runner'
import {
  appendActivity,
  createRecoveredInterruptedState,
  createStoppedState,
  withStatus,
  type BackgroundAgentRefreshExecutionControl,
} from './background-agent-refresh-state'
import {
  createEmptyProjectState,
  toSnapshot,
  type BackgroundAgentHostDeps,
  type BackgroundAgentProjectState,
} from './background-agent-types'
import { rankSuggestions } from '../../../background-agent/core/ranking/suggestion-ranker'

interface BackgroundAgentHostOptions {
  store?: BackgroundAgentStore
  webResearchClient?: WebResearchClient
}

interface RefreshExecutionHandle extends BackgroundAgentRefreshExecutionControl {
  promise: Promise<BackgroundAgentSnapshot>
}

export class BackgroundAgentHost {
  private readonly store: BackgroundAgentStore
  private readonly webResearchClient: WebResearchClient
  private readonly refreshRunner: BackgroundAgentRefreshRunner
  private readonly inFlightRefreshes = new Map<string, RefreshExecutionHandle>()

  constructor(
    private readonly deps: BackgroundAgentHostDeps,
    options: BackgroundAgentHostOptions = {},
  ) {
    this.store = options.store ?? new BackgroundAgentStore()
    this.webResearchClient = options.webResearchClient ?? new RuntimeWebResearchClient(this.deps)
    this.refreshRunner = new BackgroundAgentRefreshRunner(this.deps, this.store, this.webResearchClient)
  }

  listSuggestions(projectId: string): BackgroundAgentSnapshot {
    return toSnapshot(this.getLiveProjectState(projectId))
  }

  getStatus(projectId: string): BackgroundAgentGenerationStatus {
    return this.getLiveProjectState(projectId).status
  }

  clearSuggestions(projectId: string): BackgroundAgentSnapshot {
    const cleared = createEmptyProjectState()
    this.store.setProjectState(projectId, cleared)
    debugLog(`[background-agent] clear project=${projectId}`)
    return toSnapshot(cleared)
  }

  refreshSuggestions(projectId: string, activeSessionId: string | null): Promise<BackgroundAgentSnapshot> {
    return this.startRefresh(projectId, activeSessionId, 'fresh')
  }

  resumeSuggestions(projectId: string, activeSessionId: string | null): Promise<BackgroundAgentSnapshot> {
    const current = this.getLiveProjectState(projectId)
    if (current.status.refreshState !== 'paused' || !current.pendingRefresh) {
      debugLog(`[background-agent] resume ignored project=${projectId} reason=no-paused-refresh`)
      return Promise.resolve(toSnapshot(current))
    }
    return this.startRefresh(projectId, activeSessionId, 'resume')
  }

  pauseSuggestions(projectId: string): BackgroundAgentSnapshot {
    return this.requestRefreshAction(projectId, 'pause')
  }

  stopSuggestions(projectId: string): BackgroundAgentSnapshot {
    const current = this.getLiveProjectState(projectId)
    if (current.status.refreshState === 'paused') {
      const stopped = createStoppedState(current, 'Stopped the paused Ideas refresh.')
      this.store.setProjectState(projectId, stopped)
      debugLog(`[background-agent] stop project=${projectId} mode=paused`)
      return toSnapshot(stopped)
    }
    return this.requestRefreshAction(projectId, 'stop')
  }

  recordFeedback(projectId: string, suggestionId: string, feedbackType: BackgroundAgentFeedbackType): BackgroundAgentSnapshot {
    if (!isBackgroundAgentFeedbackType(feedbackType)) {
      throw new Error(`Unsupported background-agent feedback type: ${feedbackType}`)
    }

    const current = this.store.getProjectState(projectId)
    if (!current.suggestions.some((suggestion) => suggestion.id === suggestionId)) {
      throw new Error(`Suggestion not found: ${suggestionId}`)
    }

    this.store.addFeedback(projectId, {
      suggestionId,
      feedbackType,
      createdAt: new Date().toISOString(),
    })

    const updated = this.store.getProjectState(projectId)
    if (updated.profile) {
      updated.suggestions = rankSuggestions(updated.suggestions, {
        limit: 5,
        profile: updated.profile,
        feedbackEvents: updated.feedback,
      })
    }
    updated.status = {
      ...updated.status,
      recentActivity: appendActivity(updated.status.recentActivity, [
        `Recorded feedback: ${feedbackType.replace(/_/g, ' ')}.`,
      ]),
    }
    this.store.setProjectState(projectId, updated)
    debugLog(`[background-agent] feedback project=${projectId} suggestion=${suggestionId} type=${feedbackType}`)
    return toSnapshot(updated)
  }

  private startRefresh(
    projectId: string,
    activeSessionId: string | null,
    mode: 'fresh' | 'resume',
  ): Promise<BackgroundAgentSnapshot> {
    const existing = this.inFlightRefreshes.get(projectId)
    if (existing) {
      debugLog(`[background-agent] ${mode} join project=${projectId} activeSession=${activeSessionId ?? '(none)'}`)
      return existing.promise
    }

    const current = this.getLiveProjectState(projectId)
    const execution: RefreshExecutionHandle = {
      requestedAction: null,
      promise: Promise.resolve({} as BackgroundAgentSnapshot),
    }
    execution.promise = mode === 'resume'
      ? this.refreshRunner.runResume(projectId, activeSessionId, execution, current)
      : this.refreshRunner.runFresh(projectId, activeSessionId, execution, current)

    this.inFlightRefreshes.set(projectId, execution)
    void execution.promise.finally(() => {
      if (this.inFlightRefreshes.get(projectId) === execution) {
        this.inFlightRefreshes.delete(projectId)
      }
    })
    return execution.promise
  }

  private requestRefreshAction(
    projectId: string,
    action: 'pause' | 'stop',
  ): BackgroundAgentSnapshot {
    const current = this.getLiveProjectState(projectId)
    const execution = this.inFlightRefreshes.get(projectId)
    if (!execution || execution.requestedAction === 'stop') {
      return toSnapshot(current)
    }

    execution.requestedAction = action
    const nextState = withStatus(current, {
      phase: current.status.phase,
      isRefreshing: true,
      refreshState: action === 'pause' ? 'pause_requested' : 'stop_requested',
      lastRefreshedAt: current.status.lastRefreshedAt,
      error: null,
      summary: action === 'pause'
        ? 'Pausing the Ideas refresh after the current step.'
        : 'Stopping the Ideas refresh after the current step.',
      detail: action === 'pause'
        ? 'Waiting for the active research step to finish before pausing.'
        : 'Waiting for the active research step to finish before stopping.',
      stepLabel: current.status.stepLabel,
      recentActivity: appendActivity(current.status.recentActivity, [
        action === 'pause'
          ? 'Pause requested for the active Ideas refresh.'
          : 'Stop requested for the active Ideas refresh.',
      ]),
    })
    this.store.setProjectState(projectId, nextState)
    debugLog(`[background-agent] ${action} requested project=${projectId}`)
    return toSnapshot(nextState)
  }

  private getLiveProjectState(projectId: string): BackgroundAgentProjectState {
    const current = this.store.getProjectState(projectId)
    if (!current.status.isRefreshing || this.inFlightRefreshes.has(projectId)) {
      return current
    }

    const recovered = createRecoveredInterruptedState(current)
    this.store.setProjectState(projectId, recovered)
    debugLog(`[background-agent] recovered stale refresh project=${projectId}`)
    return recovered
  }
}
