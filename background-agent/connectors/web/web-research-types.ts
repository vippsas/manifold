import type {
  BackgroundAgentProjectProfile,
  BackgroundAgentRuntimeContext,
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

export interface WebResearchResult {
  topic: WebResearchTopic
  sources: WebResearchSourceRecord[]
}

export interface WebResearchContext {
  projectProfile: BackgroundAgentProjectProfile
  runtimeContext: BackgroundAgentRuntimeContext
}
