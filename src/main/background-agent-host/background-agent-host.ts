import type {
  BackgroundAgentFeedbackType,
  BackgroundAgentGenerationStatus,
  BackgroundAgentSnapshot,
} from '../../../background-agent/schemas/background-agent-types'
import { loadLocalProjectInput } from '../../../background-agent/connectors/local-project/local-project-loader'
import { buildProjectProfile } from '../../../background-agent/core/project-profile/project-profile-builder'
import { generateResearchTopics } from '../../../background-agent/core/research/research-topic-generator'
import { synthesizeSuggestions } from '../../../background-agent/core/synthesis/suggestion-synthesizer'
import { rankSuggestions } from '../../../background-agent/core/ranking/suggestion-ranker'
import { isBackgroundAgentFeedbackType } from '../../../background-agent/core/feedback/feedback-policy'
import type { WebResearchClient } from '../../../background-agent/connectors/web/web-research-client'
import { resolveBackgroundAgentRuntime } from './background-agent-runtime'
import { BackgroundAgentStore } from './background-agent-store'
import { RuntimeWebResearchClient } from './background-agent-research-client'
import { debugLog } from '../app/debug-log'
import {
  cloneProjectState,
  toSnapshot,
  type BackgroundAgentHostDeps,
  type BackgroundAgentProjectState,
} from './background-agent-types'

interface BackgroundAgentHostOptions {
  store?: BackgroundAgentStore
  webResearchClient?: WebResearchClient
}

export class BackgroundAgentHost {
  private readonly store: BackgroundAgentStore
  private readonly webResearchClient: WebResearchClient
  private readonly activeRefreshes = new Set<string>()

  constructor(
    private readonly deps: BackgroundAgentHostDeps,
    options: BackgroundAgentHostOptions = {},
  ) {
    this.store = options.store ?? new BackgroundAgentStore()
    this.webResearchClient = options.webResearchClient ?? new RuntimeWebResearchClient(this.deps)
  }

  listSuggestions(projectId: string): BackgroundAgentSnapshot {
    return toSnapshot(this.getLiveProjectState(projectId))
  }

  getStatus(projectId: string): BackgroundAgentGenerationStatus {
    return this.getLiveProjectState(projectId).status
  }

  async refreshSuggestions(projectId: string, activeSessionId: string | null): Promise<BackgroundAgentSnapshot> {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const existingState = this.getLiveProjectState(projectId)
    this.activeRefreshes.add(projectId)
    debugLog(`[background-agent] refresh start project=${projectId} activeSession=${activeSessionId ?? '(none)'}`)
    this.store.setProjectState(projectId, withStatus(existingState, {
      phase: 'profiling',
      isRefreshing: true,
      lastRefreshedAt: existingState.status.lastRefreshedAt,
      error: null,
      summary: 'Building a project profile from local docs and metadata.',
      detail: 'Reading README, planning docs, package manifests, and repo structure.',
      stepLabel: 'Step 1 of 4',
      recentActivity: [
        'Started a new Ideas refresh.',
        'Reading local project context to understand what this product is.',
      ],
    }))

    try {
      const localInput = loadLocalProjectInput(project.id, project.name, project.path)
      const profile = buildProjectProfile(localInput)
      const runtime = resolveBackgroundAgentRuntime(this.deps, projectId, activeSessionId)
      const topics = generateResearchTopics(profile)
      debugLog(
        `[background-agent] profile ready project=${projectId} runtime=${runtime.runtimeId} topics=${topics.length} summary=${sanitizeForLog(profile.summary)}`,
      )

      this.store.setProjectSnapshot(projectId, {
        profile,
        suggestions: existingState.suggestions,
        status: {
          phase: 'researching',
          isRefreshing: true,
          lastRefreshedAt: existingState.status.lastRefreshedAt,
          error: null,
          summary: 'Researching the web for source-backed ideas.',
          detail: `Prepared ${topics.length} focused research ${topics.length === 1 ? 'thread' : 'threads'} using ${runtime.context.runtimeId}.`,
          stepLabel: 'Step 2 of 4',
          recentActivity: [
            'Built a local project profile.',
            `Prepared ${topics.length} research ${topics.length === 1 ? 'topic' : 'topics'} for external research.`,
          ],
        },
      })

      const researchResults = await this.webResearchClient.research(topics, {
        projectProfile: profile,
        runtimeContext: runtime.context,
      }, (event) => {
        debugLog(
          `[background-agent] ${event.kind} project=${projectId} topic=${event.topic.id} step=${event.current}/${event.total} message=${sanitizeForLog(event.message)}${event.detail ? ` detail=${sanitizeForLog(event.detail)}` : ''}`,
        )
        const current = this.store.getProjectState(projectId)
        const previousActivity = current.status.recentActivity
        this.store.setProjectState(projectId, withStatus(current, {
          phase: 'researching',
          isRefreshing: true,
          lastRefreshedAt: current.status.lastRefreshedAt,
          error: null,
          summary: event.message,
          detail: event.detail ?? `Research topic ${event.current} of ${event.total}`,
          stepLabel: `Topic ${event.current} of ${event.total}`,
          recentActivity: appendActivity(previousActivity, [
            event.message,
            event.detail ?? null,
          ]),
        }))
      })
      this.store.setProjectSnapshot(projectId, {
        profile,
        suggestions: existingState.suggestions,
        status: {
          phase: 'synthesizing',
          isRefreshing: true,
          lastRefreshedAt: existingState.status.lastRefreshedAt,
          error: null,
          summary: 'Synthesizing and ranking the strongest ideas.',
          detail: 'Merging overlapping findings and filtering weak evidence.',
          stepLabel: 'Step 3 of 4',
          recentActivity: appendActivity(this.store.getProjectState(projectId).status.recentActivity, [
            'Finished web research and started synthesizing candidate ideas.',
          ]),
        },
      })
      const suggestions = rankSuggestions(synthesizeSuggestions(profile, researchResults), 5)
      debugLog(`[background-agent] synthesis complete project=${projectId} suggestions=${suggestions.length}`)
      const snapshot: BackgroundAgentSnapshot = {
        profile,
        suggestions,
        status: {
          phase: 'ready',
          isRefreshing: false,
          lastRefreshedAt: new Date().toISOString(),
          error: null,
          summary: suggestions.length > 0
            ? `Prepared ${suggestions.length} source-backed ${suggestions.length === 1 ? 'idea' : 'ideas'}.`
            : 'No source-backed ideas cleared the evidence bar.',
          detail: suggestions.length > 0
            ? 'The Ideas feed is ready to review.'
            : 'The project profile is ready, but external research did not yield strong enough signals.',
          stepLabel: 'Step 4 of 4',
          recentActivity: appendActivity(this.store.getProjectState(projectId).status.recentActivity, [
            suggestions.length > 0
              ? `Ranked and stored ${suggestions.length} idea ${suggestions.length === 1 ? 'card' : 'cards'}.`
              : 'Completed ranking, but no idea cards survived the evidence threshold.',
          ]),
        },
      }
      this.store.setProjectSnapshot(projectId, snapshot)
      debugLog(`[background-agent] refresh ready project=${projectId} suggestions=${suggestions.length}`)
      return snapshot
    } catch (error) {
      debugLog(`[background-agent] refresh failed project=${projectId} error=${sanitizeForLog(formatError(error))}`)
      const failedState = withStatus(this.store.getProjectState(projectId), {
        phase: 'error',
        isRefreshing: false,
        lastRefreshedAt: existingState.status.lastRefreshedAt,
        error: formatError(error),
        summary: 'Ideas refresh failed.',
        detail: 'The background agent could not finish building the feed.',
        stepLabel: null,
        recentActivity: appendActivity(this.store.getProjectState(projectId).status.recentActivity, [
          `Refresh failed: ${formatError(error)}`,
        ]),
      })
      this.store.setProjectState(projectId, failedState)
      return toSnapshot(failedState)
    } finally {
      this.activeRefreshes.delete(projectId)
    }
  }

  recordFeedback(projectId: string, suggestionId: string, feedbackType: BackgroundAgentFeedbackType): void {
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
    debugLog(`[background-agent] feedback project=${projectId} suggestion=${suggestionId} type=${feedbackType}`)
  }

  private getLiveProjectState(projectId: string): BackgroundAgentProjectState {
    const current = this.store.getProjectState(projectId)
    if (!current.status.isRefreshing || this.activeRefreshes.has(projectId)) {
      return current
    }

    const recovered = withStatus(current, {
      phase: 'error',
      isRefreshing: false,
      lastRefreshedAt: current.status.lastRefreshedAt,
      error: current.status.error ?? 'Previous Ideas refresh was interrupted.',
      summary: 'The previous Ideas refresh was interrupted.',
      detail: 'No live background research task is attached to this refresh anymore. Refresh again to retry.',
      stepLabel: null,
      recentActivity: appendActivity(current.status.recentActivity, [
        'Recovered a stale refresh state with no active background task.',
      ]),
    })
    this.store.setProjectState(projectId, recovered)
    debugLog(`[background-agent] recovered stale refresh project=${projectId}`)
    return recovered
  }
}

function withStatus(state: BackgroundAgentProjectState, status: BackgroundAgentGenerationStatus): BackgroundAgentProjectState {
  const next = cloneProjectState(state)
  next.status = {
    ...status,
    recentActivity: [...status.recentActivity],
  }
  return next
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown background-agent error.'
}

function sanitizeForLog(value: string, maxLength = 220): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`
}

function appendActivity(existing: string[], nextItems: Array<string | null | undefined>, limit = 6): string[] {
  const merged = [...existing]
  for (const item of nextItems) {
    if (!item) continue
    const trimmed = item.trim()
    if (!trimmed) continue
    if (merged.at(-1) !== trimmed) {
      merged.push(trimmed)
    }
  }
  return merged.slice(-limit)
}
