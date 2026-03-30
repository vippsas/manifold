export type BackgroundAgentSuggestionCategory =
  | 'feature_opportunity'
  | 'architecture_improvement'
  | 'pattern_transfer'
  | 'ecosystem_shift'

export type BackgroundAgentSourceType =
  | 'official_docs'
  | 'changelog'
  | 'oss_repo'
  | 'oss_issue'
  | 'oss_discussion'
  | 'engineering_blog'
  | 'forum'
  | 'community'
  | 'other'

export type BackgroundAgentSourceTrust = 'high' | 'medium' | 'low'
export type BackgroundAgentRating = 'low' | 'medium' | 'high'

export interface BackgroundAgentSuggestionSource {
  id: string
  title: string
  url: string
  type: BackgroundAgentSourceType
  trust: BackgroundAgentSourceTrust
  publishedAt: string | null
  note?: string
}

export interface BackgroundAgentProjectProfile {
  projectId: string
  projectName: string
  projectPath: string
  summary: string
  productType: string | null
  targetUser: string | null
  majorWorkflows: string[]
  architectureShape: string | null
  dependencyStack: string[]
  openQuestions: string[]
  sourcePaths: string[]
  generatedAt: string
}

export interface BackgroundAgentSuggestion {
  id: string
  title: string
  category: BackgroundAgentSuggestionCategory
  summary: string
  whyItMatters: string
  whyNow: string | null
  supportingSources: BackgroundAgentSuggestionSource[]
  evidence: string[]
  confidence: BackgroundAgentRating
  novelty: BackgroundAgentRating
  effort: BackgroundAgentRating
  impact: BackgroundAgentRating
  createdAt: string
}

export type BackgroundAgentGenerationPhase =
  | 'idle'
  | 'profiling'
  | 'researching'
  | 'synthesizing'
  | 'ready'
  | 'error'

export interface BackgroundAgentGenerationStatus {
  phase: BackgroundAgentGenerationPhase
  isRefreshing: boolean
  lastRefreshedAt: string | null
  error: string | null
  summary: string | null
  detail: string | null
  stepLabel: string | null
  recentActivity: string[]
}

export type BackgroundAgentFeedbackType =
  | 'useful'
  | 'not_relevant'
  | 'obvious'
  | 'weak_evidence'
  | 'badly_timed'

export interface BackgroundAgentFeedbackEvent {
  suggestionId: string
  feedbackType: BackgroundAgentFeedbackType
  createdAt: string
}

export interface BackgroundAgentRuntimeContext {
  activeSessionId: string | null
  runtimeId: string
  worktreePath: string
  mode: 'non-interactive'
}

export interface BackgroundAgentSnapshot {
  profile: BackgroundAgentProjectProfile | null
  suggestions: BackgroundAgentSuggestion[]
  status: BackgroundAgentGenerationStatus
}
