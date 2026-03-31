import type {
  BackgroundAgentFeedbackEvent,
  BackgroundAgentGenerationStatus,
  BackgroundAgentProjectProfile,
  BackgroundAgentSnapshot,
  BackgroundAgentSuggestion,
} from '../../../background-agent/schemas/background-agent-types'
import type { WebResearchResult, WebResearchTopic } from '../../../background-agent/connectors/web/web-research-types'
import type { SettingsStore } from '../store/settings-store'
import type { ProjectRegistry } from '../store/project-registry'
import type { SessionManager } from '../session/session-manager'
import type { GitOperationsManager } from '../git/git-operations'

export interface BackgroundAgentPendingRefreshState {
  profile: BackgroundAgentProjectProfile
  topics: WebResearchTopic[]
  completedResults: WebResearchResult[]
}

export interface BackgroundAgentProjectState extends BackgroundAgentSnapshot {
  feedback: BackgroundAgentFeedbackEvent[]
  pendingRefresh: BackgroundAgentPendingRefreshState | null
}

export interface BackgroundAgentStoreData {
  projects: Record<string, BackgroundAgentProjectState>
}

export interface BackgroundAgentHostDeps {
  settingsStore: SettingsStore
  projectRegistry: ProjectRegistry
  sessionManager: SessionManager
  gitOps: GitOperationsManager
}

export const EMPTY_BACKGROUND_AGENT_STATUS: BackgroundAgentGenerationStatus = {
  phase: 'idle',
  isRefreshing: false,
  refreshState: 'idle',
  lastRefreshedAt: null,
  error: null,
  summary: null,
  detail: null,
  stepLabel: null,
  recentActivity: [],
}

export const EMPTY_BACKGROUND_AGENT_SNAPSHOT: BackgroundAgentSnapshot = {
  profile: null,
  suggestions: [],
  status: EMPTY_BACKGROUND_AGENT_STATUS,
}

export function createEmptyProjectState(): BackgroundAgentProjectState {
  return {
    profile: null,
    suggestions: [],
    status: { ...EMPTY_BACKGROUND_AGENT_STATUS },
    feedback: [],
    pendingRefresh: null,
  }
}

export function cloneProjectState(state: BackgroundAgentProjectState): BackgroundAgentProjectState {
  return {
    profile: cloneProfile(state.profile),
    suggestions: (state.suggestions ?? []).map(cloneSuggestion),
    status: cloneStatus(state.status ?? EMPTY_BACKGROUND_AGENT_STATUS),
    feedback: (state.feedback ?? []).map((event) => ({ ...event })),
    pendingRefresh: clonePendingRefresh(state.pendingRefresh ?? null),
  }
}

function cloneSuggestion(suggestion: BackgroundAgentSuggestion): BackgroundAgentSuggestion {
  const legacySuggestion = suggestion as BackgroundAgentSuggestion & {
    supportingSources?: BackgroundAgentSuggestion['supportingSources']
    evidence?: string[]
  }

  return {
    ...legacySuggestion,
    supportingSources: (legacySuggestion.supportingSources ?? []).map((source) => ({ ...source })),
    evidence: [...(legacySuggestion.evidence ?? [])],
  }
}

export function toSnapshot(state: BackgroundAgentProjectState): BackgroundAgentSnapshot {
  return {
    profile: cloneProfile(state.profile),
    suggestions: (state.suggestions ?? []).map(cloneSuggestion),
    status: cloneStatus(state.status ?? EMPTY_BACKGROUND_AGENT_STATUS),
  }
}

function cloneStatus(status: BackgroundAgentGenerationStatus): BackgroundAgentGenerationStatus {
  return {
    ...status,
    refreshState: status.refreshState ?? (status.isRefreshing ? 'running' : 'idle'),
    summary: status.summary ?? null,
    detail: status.detail ?? null,
    stepLabel: status.stepLabel ?? null,
    recentActivity: [...(status.recentActivity ?? [])],
  }
}

function clonePendingRefresh(
  pendingRefresh: BackgroundAgentPendingRefreshState | null,
): BackgroundAgentPendingRefreshState | null {
  if (!pendingRefresh) return null

  return {
    profile: cloneProfile(pendingRefresh.profile) as BackgroundAgentProjectProfile,
    topics: pendingRefresh.topics.map((topic) => ({ ...topic })),
    completedResults: pendingRefresh.completedResults.map((result) => ({
      ...result,
      topic: { ...result.topic },
      findings: [...result.findings],
      sources: result.sources.map((source) => ({ ...source })),
      candidateSuggestions: result.candidateSuggestions.map((suggestion) => ({
        ...suggestion,
        evidence: [...suggestion.evidence],
      })),
    })),
  }
}

function cloneProfile(profile: BackgroundAgentProjectProfile | null): BackgroundAgentProjectProfile | null {
  if (!profile) return null

  const legacyProfile = profile as BackgroundAgentProjectProfile & {
    majorWorkflows?: string[]
    dependencyStack?: string[]
    openQuestions?: string[]
    recentChanges?: string[]
    sourcePaths?: string[]
  }

  return {
    ...legacyProfile,
    majorWorkflows: [...(legacyProfile.majorWorkflows ?? [])],
    dependencyStack: [...(legacyProfile.dependencyStack ?? [])],
    openQuestions: [...(legacyProfile.openQuestions ?? [])],
    recentChanges: [...(legacyProfile.recentChanges ?? [])],
    sourcePaths: [...(legacyProfile.sourcePaths ?? [])],
  }
}
