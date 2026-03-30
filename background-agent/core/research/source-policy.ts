import type {
  BackgroundAgentSourceTrust,
  BackgroundAgentSourceType,
  BackgroundAgentSuggestionSource,
} from '../../schemas/background-agent-types'

const PRIMARY_SOURCE_TYPES = new Set<BackgroundAgentSourceType>([
  'official_docs',
  'changelog',
  'oss_repo',
  'oss_issue',
  'oss_discussion',
  'engineering_blog',
])

const SUPPORTING_ONLY_TYPES = new Set<BackgroundAgentSourceType>([
  'forum',
  'community',
])

export function isAllowedSourceType(type: BackgroundAgentSourceType): boolean {
  return PRIMARY_SOURCE_TYPES.has(type) || SUPPORTING_ONLY_TYPES.has(type)
}

export function isPrimarySourceType(type: BackgroundAgentSourceType): boolean {
  return PRIMARY_SOURCE_TYPES.has(type)
}

export function getSourceTrust(type: BackgroundAgentSourceType): BackgroundAgentSourceTrust {
  if (type === 'official_docs' || type === 'changelog' || type === 'oss_repo') return 'high'
  if (type === 'oss_issue' || type === 'oss_discussion' || type === 'engineering_blog') return 'medium'
  return 'low'
}

export function hasMinimumEvidence(sources: BackgroundAgentSuggestionSource[]): boolean {
  const uniqueUrls = new Set(sources.map((source) => source.url))
  return uniqueUrls.size >= 2 && sources.some((source) => source.trust === 'high')
}
