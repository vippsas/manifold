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

  constructor(
    private readonly deps: BackgroundAgentHostDeps,
    options: BackgroundAgentHostOptions = {},
  ) {
    this.store = options.store ?? new BackgroundAgentStore()
    this.webResearchClient = options.webResearchClient ?? new RuntimeWebResearchClient(this.deps)
  }

  listSuggestions(projectId: string): BackgroundAgentSnapshot {
    return toSnapshot(this.store.getProjectState(projectId))
  }

  getStatus(projectId: string): BackgroundAgentGenerationStatus {
    return this.store.getProjectState(projectId).status
  }

  async refreshSuggestions(projectId: string, activeSessionId: string | null): Promise<BackgroundAgentSnapshot> {
    const project = this.deps.projectRegistry.getProject(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const existingState = this.store.getProjectState(projectId)
    this.store.setProjectState(projectId, withStatus(existingState, {
      phase: 'profiling',
      isRefreshing: true,
      lastRefreshedAt: existingState.status.lastRefreshedAt,
      error: null,
    }))

    try {
      const localInput = loadLocalProjectInput(project.id, project.name, project.path)
      const profile = buildProjectProfile(localInput)
      const runtime = resolveBackgroundAgentRuntime(this.deps, projectId, activeSessionId)
      const topics = generateResearchTopics(profile)

      this.store.setProjectSnapshot(projectId, {
        profile,
        suggestions: existingState.suggestions,
        status: {
          phase: 'researching',
          isRefreshing: true,
          lastRefreshedAt: existingState.status.lastRefreshedAt,
          error: null,
        },
      })

      const researchResults = await this.webResearchClient.research(topics, {
        projectProfile: profile,
        runtimeContext: runtime.context,
      })
      this.store.setProjectSnapshot(projectId, {
        profile,
        suggestions: existingState.suggestions,
        status: {
          phase: 'synthesizing',
          isRefreshing: true,
          lastRefreshedAt: existingState.status.lastRefreshedAt,
          error: null,
        },
      })
      const suggestions = rankSuggestions(synthesizeSuggestions(profile, researchResults), 5)
      const snapshot: BackgroundAgentSnapshot = {
        profile,
        suggestions,
        status: {
          phase: 'ready',
          isRefreshing: false,
          lastRefreshedAt: new Date().toISOString(),
          error: null,
        },
      }
      this.store.setProjectSnapshot(projectId, snapshot)
      return snapshot
    } catch (error) {
      const failedState = withStatus(this.store.getProjectState(projectId), {
        phase: 'error',
        isRefreshing: false,
        lastRefreshedAt: existingState.status.lastRefreshedAt,
        error: formatError(error),
      })
      this.store.setProjectState(projectId, failedState)
      return toSnapshot(failedState)
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
  }
}

function withStatus(state: BackgroundAgentProjectState, status: BackgroundAgentGenerationStatus): BackgroundAgentProjectState {
  const next = cloneProjectState(state)
  next.status = { ...status }
  return next
}

function formatError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return 'Unknown background-agent error.'
}
