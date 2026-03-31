import type { BackgroundAgentSnapshot } from '../../../background-agent/schemas/background-agent-types'
import { loadLocalProjectInput } from '../../../background-agent/connectors/local-project/local-project-loader'
import { buildProjectProfile } from '../../../background-agent/core/project-profile/project-profile-builder'
import { generateResearchTopics } from '../../../background-agent/core/research/research-topic-generator'
import { synthesizeSuggestions } from '../../../background-agent/core/synthesis/suggestion-synthesizer'
import { rankSuggestions } from '../../../background-agent/core/ranking/suggestion-ranker'
import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import type {
  WebResearchContext,
  WebResearchProgressEvent,
  WebResearchResult,
} from '../../../background-agent/connectors/web/web-research-types'
import { resolveBackgroundAgentRuntime } from './background-agent-runtime'
import { BackgroundAgentStore } from './background-agent-store'
import { debugLog } from '../app/debug-log'
import {
  appendActivity,
  cloneResearchResult,
  createEmptyResearchResult,
  createFailedState,
  createPausedState,
  createProfilingState,
  createStoppedState,
  formatError,
  getRequestedActionDetail,
  getRequestedActionSummary,
  mapRequestedActionToRefreshState,
  sanitizeForLog,
  withStatus,
  type BackgroundAgentRefreshExecutionControl,
} from './background-agent-refresh-state'
import type {
  BackgroundAgentHostDeps,
  BackgroundAgentPendingRefreshState,
  BackgroundAgentProjectState,
} from './background-agent-types'
import { toSnapshot } from './background-agent-types'

export class BackgroundAgentRefreshRunner {
  constructor(
    private readonly deps: BackgroundAgentHostDeps,
    private readonly store: BackgroundAgentStore,
    private readonly webResearchClient: WebResearchClient,
  ) {}

  async runFresh(
    projectId: string,
    activeSessionId: string | null,
    execution: BackgroundAgentRefreshExecutionControl,
    existingState: BackgroundAgentProjectState,
  ): Promise<BackgroundAgentSnapshot> {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    debugLog(`[background-agent] refresh start project=${projectId} activeSession=${activeSessionId ?? '(none)'}`)
    this.store.setProjectState(projectId, createProfilingState(existingState))

    try {
      const localInput = loadLocalProjectInput(project.id, project.name, project.path)
      const profile = buildProjectProfile(localInput)
      const runtime = resolveBackgroundAgentRuntime(this.deps, projectId, activeSessionId)
      const topics = generateResearchTopics(profile)
      debugLog(
        `[background-agent] profile ready project=${projectId} runtime=${runtime.runtimeId} topics=${topics.length} summary=${sanitizeForLog(profile.summary)}`,
      )

      const preparedState = this.store.getProjectState(projectId)
      preparedState.profile = profile
      preparedState.pendingRefresh = { profile, topics, completedResults: [] }
      preparedState.status = {
        phase: 'researching',
        isRefreshing: true,
        refreshState: 'running',
        lastRefreshedAt: existingState.status.lastRefreshedAt,
        error: null,
        summary: 'Researching the web for source-backed ideas.',
        detail: `Prepared ${topics.length} focused research ${topics.length === 1 ? 'thread' : 'threads'} using ${runtime.context.runtimeId}.`,
        stepLabel: 'Step 2 of 4',
        recentActivity: [
          'Built a local project profile.',
          `Prepared ${topics.length} research ${topics.length === 1 ? 'topic' : 'topics'} for external research.`,
        ],
      }
      this.store.setProjectState(projectId, preparedState)
      return await this.continueRefresh(projectId, activeSessionId, execution, existingState.feedback)
    } catch (error) {
      debugLog(`[background-agent] refresh failed project=${projectId} error=${sanitizeForLog(formatError(error))}`)
      const failedState = createFailedState(this.store.getProjectState(projectId), 'Ideas refresh failed.', error, false)
      this.store.setProjectState(projectId, failedState)
      return toSnapshot(failedState)
    }
  }

  async runResume(
    projectId: string,
    activeSessionId: string | null,
    execution: BackgroundAgentRefreshExecutionControl,
    existingState: BackgroundAgentProjectState,
  ): Promise<BackgroundAgentSnapshot> {
    const pendingRefresh = existingState.pendingRefresh
    if (!pendingRefresh) {
      return toSnapshot(existingState)
    }

    try {
      const runtime = resolveBackgroundAgentRuntime(this.deps, projectId, activeSessionId)
      const remainingTopics = Math.max(0, pendingRefresh.topics.length - pendingRefresh.completedResults.length)
      const resumedState = this.store.getProjectState(projectId)
      resumedState.status = {
        phase: remainingTopics > 0 ? 'researching' : 'synthesizing',
        isRefreshing: true,
        refreshState: 'running',
        lastRefreshedAt: resumedState.status.lastRefreshedAt,
        error: null,
        summary: 'Resuming the paused Ideas refresh.',
        detail: remainingTopics > 0
          ? `Continuing ${remainingTopics} remaining research ${remainingTopics === 1 ? 'topic' : 'topics'} using ${runtime.context.runtimeId}.`
          : 'Web research is already complete. Resuming synthesis and ranking.',
        stepLabel: remainingTopics > 0
          ? `Topic ${pendingRefresh.completedResults.length + 1} of ${pendingRefresh.topics.length}`
          : 'Step 3 of 4',
        recentActivity: appendActivity(resumedState.status.recentActivity, [
          'Resumed the paused Ideas refresh.',
        ]),
      }
      this.store.setProjectState(projectId, resumedState)
      debugLog(`[background-agent] resume start project=${projectId} remainingTopics=${remainingTopics}`)
      return await this.continueRefresh(projectId, activeSessionId, execution, existingState.feedback)
    } catch (error) {
      debugLog(`[background-agent] resume failed project=${projectId} error=${sanitizeForLog(formatError(error))}`)
      const failedState = createFailedState(existingState, 'Ideas resume failed.', error, true)
      this.store.setProjectState(projectId, failedState)
      return toSnapshot(failedState)
    }
  }

  private async continueRefresh(
    projectId: string,
    activeSessionId: string | null,
    execution: BackgroundAgentRefreshExecutionControl,
    feedbackEvents: BackgroundAgentProjectState['feedback'],
  ): Promise<BackgroundAgentSnapshot> {
    const current = this.store.getProjectState(projectId)
    const pendingRefresh = current.pendingRefresh
    if (!pendingRefresh) {
      return toSnapshot(current)
    }

    const runtime = resolveBackgroundAgentRuntime(this.deps, projectId, activeSessionId)
    const context: WebResearchContext = {
      projectProfile: pendingRefresh.profile,
      runtimeContext: runtime.context,
    }
    const results = pendingRefresh.completedResults.map(cloneResearchResult)
    const totalTopics = pendingRefresh.topics.length

    for (let index = results.length; index < totalTopics; index += 1) {
      const before = this.applyControlState(projectId, execution, index, totalTopics)
      if (before) return before

      const topicResults = await this.webResearchClient.research(
        [pendingRefresh.topics[index]],
        context,
        (event) => this.applyResearchProgress(projectId, execution, event, index + 1, totalTopics),
      )

      results.push(topicResults[0] ?? createEmptyResearchResult(pendingRefresh.topics[index]))
      this.storeCompletedResults(projectId, pendingRefresh, results)

      const after = this.applyControlState(projectId, execution, results.length, totalTopics)
      if (after) return after
    }

    const interrupted = this.applyControlState(projectId, execution, results.length, totalTopics)
    if (interrupted) return interrupted

    return this.finishReadyState(projectId, pendingRefresh, results, feedbackEvents)
  }

  private finishReadyState(
    projectId: string,
    pendingRefresh: BackgroundAgentPendingRefreshState,
    results: WebResearchResult[],
    feedbackEvents: BackgroundAgentProjectState['feedback'],
  ): BackgroundAgentSnapshot {
    const synthState = this.store.getProjectState(projectId)
    synthState.status = {
      phase: 'synthesizing',
      isRefreshing: true,
      refreshState: 'running',
      lastRefreshedAt: synthState.status.lastRefreshedAt,
      error: null,
      summary: 'Synthesizing and ranking the strongest ideas.',
      detail: 'Merging overlapping findings and filtering weak evidence.',
      stepLabel: 'Step 3 of 4',
      recentActivity: appendActivity(synthState.status.recentActivity, [
        'Finished web research and started synthesizing candidate ideas.',
      ]),
    }
    this.store.setProjectState(projectId, synthState)

    const suggestions = rankSuggestions(synthesizeSuggestions(pendingRefresh.profile, results), {
      limit: 5,
      profile: pendingRefresh.profile,
      feedbackEvents,
    })
    debugLog(`[background-agent] synthesis complete project=${projectId} suggestions=${suggestions.length}`)

    const readyState = this.store.getProjectState(projectId)
    readyState.profile = pendingRefresh.profile
    readyState.suggestions = suggestions
    readyState.pendingRefresh = null
    readyState.status = {
      phase: 'ready',
      isRefreshing: false,
      refreshState: 'idle',
      lastRefreshedAt: new Date().toISOString(),
      error: null,
      summary: suggestions.length > 0
        ? `Prepared ${suggestions.length} source-backed ${suggestions.length === 1 ? 'idea' : 'ideas'}.`
        : 'No source-backed ideas cleared the evidence bar.',
      detail: suggestions.length > 0
        ? 'The Ideas feed is ready to review.'
        : 'The project profile is ready, but external research did not yield strong enough signals.',
      stepLabel: 'Step 4 of 4',
      recentActivity: appendActivity(readyState.status.recentActivity, [
        suggestions.length > 0
          ? `Ranked and stored ${suggestions.length} idea ${suggestions.length === 1 ? 'card' : 'cards'}.`
          : 'Completed ranking, but no idea cards survived the evidence threshold.',
      ]),
    }
    this.store.setProjectState(projectId, readyState)
    debugLog(`[background-agent] refresh ready project=${projectId} suggestions=${suggestions.length}`)
    return toSnapshot(readyState)
  }

  private applyResearchProgress(
    projectId: string,
    execution: BackgroundAgentRefreshExecutionControl,
    event: WebResearchProgressEvent,
    currentTopicNumber: number,
    totalTopics: number,
  ): void {
    debugLog(
      `[background-agent] ${event.kind} project=${projectId} topic=${event.topic.id} step=${currentTopicNumber}/${totalTopics} message=${sanitizeForLog(event.message)}${event.detail ? ` detail=${sanitizeForLog(event.detail)}` : ''}`,
    )
    const current = this.store.getProjectState(projectId)
    this.store.setProjectState(projectId, withStatus(current, {
      phase: 'researching',
      isRefreshing: true,
      refreshState: mapRequestedActionToRefreshState(execution.requestedAction),
      lastRefreshedAt: current.status.lastRefreshedAt,
      error: null,
      summary: execution.requestedAction ? getRequestedActionSummary(execution.requestedAction) : event.message,
      detail: execution.requestedAction
        ? getRequestedActionDetail(execution.requestedAction)
        : (event.detail ?? `Research topic ${currentTopicNumber} of ${totalTopics}`),
      stepLabel: `Topic ${currentTopicNumber} of ${totalTopics}`,
      recentActivity: appendActivity(current.status.recentActivity, [event.message, event.detail ?? null]),
    }))
  }

  private applyControlState(
    projectId: string,
    execution: BackgroundAgentRefreshExecutionControl,
    completedTopics: number,
    totalTopics: number,
  ): BackgroundAgentSnapshot | null {
    const current = this.store.getProjectState(projectId)
    if (execution.requestedAction === 'pause') {
      const paused = createPausedState(current, completedTopics, totalTopics)
      this.store.setProjectState(projectId, paused)
      debugLog(`[background-agent] pause project=${projectId} completedTopics=${completedTopics}/${totalTopics}`)
      return toSnapshot(paused)
    }
    if (execution.requestedAction === 'stop') {
      const stopped = createStoppedState(current, 'Stopped the active Ideas refresh.')
      this.store.setProjectState(projectId, stopped)
      debugLog(`[background-agent] stop project=${projectId} completedTopics=${completedTopics}/${totalTopics}`)
      return toSnapshot(stopped)
    }
    return null
  }
  private storeCompletedResults(
    projectId: string,
    pendingRefresh: BackgroundAgentPendingRefreshState,
    results: WebResearchResult[],
  ): void {
    const updated = this.store.getProjectState(projectId)
    updated.pendingRefresh = {
      profile: pendingRefresh.profile,
      topics: pendingRefresh.topics.map((topic) => ({ ...topic })),
      completedResults: results.map(cloneResearchResult),
    }
    this.store.setProjectState(projectId, updated)
  }
}
