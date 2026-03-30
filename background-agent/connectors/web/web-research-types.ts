import type {
  BackgroundAgentProjectProfile,
  BackgroundAgentRating,
  BackgroundAgentRuntimeContext,
  BackgroundAgentSuggestionCategory,
  BackgroundAgentSourceType,
} from '../../schemas/background-agent-types'

export type WebResearchTopicRing = 1 | 2 | 3

export interface WebResearchTopic {
  id: string
  title: string
  query: string
  ring: WebResearchTopicRing
  rationale: string
}

export interface WebResearchSourceRecord {
  id?: string
  title: string
  url: string
  type: BackgroundAgentSourceType
  publishedAt: string | null
  snippet?: string
}

export interface WebResearchSuggestionHint {
  title: string
  category: BackgroundAgentSuggestionCategory
  summary: string
  whyItMatters: string
  whyNow: string | null
  evidence: string[]
  confidence: BackgroundAgentRating
  novelty: BackgroundAgentRating
  effort: BackgroundAgentRating
  impact: BackgroundAgentRating
}

export interface WebResearchResult {
  topic: WebResearchTopic
  topicSummary: string
  findings: string[]
  sources: WebResearchSourceRecord[]
  candidateSuggestions: WebResearchSuggestionHint[]
}

export interface WebResearchContext {
  projectProfile: BackgroundAgentProjectProfile
  runtimeContext: BackgroundAgentRuntimeContext
}
