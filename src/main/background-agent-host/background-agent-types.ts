import type {
  BackgroundAgentFeedbackEvent,
  BackgroundAgentGenerationStatus,
  BackgroundAgentProjectProfile,
  BackgroundAgentSnapshot,
  BackgroundAgentSuggestion,
} from '../../../background-agent/schemas/background-agent-types'
import type { SettingsStore } from '../store/settings-store'
import type { ProjectRegistry } from '../store/project-registry'
import type { SessionManager } from '../session/session-manager'
import type { GitOperationsManager } from '../git/git-operations'

export interface BackgroundAgentProjectState extends BackgroundAgentSnapshot {
  feedback: BackgroundAgentFeedbackEvent[]
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
  lastRefreshedAt: null,
  error: null,
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
  }
}

export function cloneProjectState(state: BackgroundAgentProjectState): BackgroundAgentProjectState {
  return {
    profile: state.profile ? { ...state.profile, majorWorkflows: [...state.profile.majorWorkflows], dependencyStack: [...state.profile.dependencyStack], openQuestions: [...state.profile.openQuestions], sourcePaths: [...state.profile.sourcePaths] } : null,
    suggestions: state.suggestions.map(cloneSuggestion),
    status: { ...state.status },
    feedback: state.feedback.map((event) => ({ ...event })),
  }
}

function cloneSuggestion(suggestion: BackgroundAgentSuggestion): BackgroundAgentSuggestion {
  return {
    ...suggestion,
    supportingSources: suggestion.supportingSources.map((source) => ({ ...source })),
    evidence: [...suggestion.evidence],
  }
}

export function toSnapshot(state: BackgroundAgentProjectState): BackgroundAgentSnapshot {
  return {
    profile: state.profile ? { ...state.profile, majorWorkflows: [...state.profile.majorWorkflows], dependencyStack: [...state.profile.dependencyStack], openQuestions: [...state.profile.openQuestions], sourcePaths: [...state.profile.sourcePaths] } : null,
    suggestions: state.suggestions.map(cloneSuggestion),
    status: { ...state.status },
  }
}
