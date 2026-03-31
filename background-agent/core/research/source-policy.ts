import type {
  BackgroundAgentSourceTrust,
  BackgroundAgentSourceType,
  BackgroundAgentSuggestionSource,
} from '../../schemas/background-agent-types'

export interface BackgroundAgentSourceCandidate {
  title: string
  url: string
  type: BackgroundAgentSourceType
}

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

const LOW_SIGNAL_TITLE_PATTERNS = [
  /\btop\s+\d+\b/i,
  /\bbest\b/i,
  /\balternatives?\b/i,
  /\bcomparison\b/i,
  /\bvs\.?\b/i,
  /\bpricing\b/i,
  /\breview\b/i,
  /\bhow to choose\b/i,
]

const LOW_SIGNAL_HOST_PATTERNS = [
  /(^|\.)g2\.com$/i,
  /(^|\.)capterra\.com$/i,
  /(^|\.)saashub\.com$/i,
  /(^|\.)sourceforge\.net$/i,
  /(^|\.)alternativeto\.net$/i,
]

export function isAllowedSourceType(type: BackgroundAgentSourceType): boolean {
  return PRIMARY_SOURCE_TYPES.has(type) || SUPPORTING_ONLY_TYPES.has(type)
}

export function isAllowedSource(source: BackgroundAgentSourceCandidate): boolean {
  return isAllowedSourceType(source.type) && !isLikelyLowSignalSource(source)
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

function isLikelyLowSignalSource(source: BackgroundAgentSourceCandidate): boolean {
  if (
    source.type === 'official_docs' ||
    source.type === 'changelog' ||
    source.type === 'oss_repo' ||
    source.type === 'oss_issue' ||
    source.type === 'oss_discussion'
  ) {
    return false
  }

  const title = source.title.trim()
  if (!title) return true
  if (LOW_SIGNAL_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return true
  }

  const hostname = getHostname(source.url)
  return hostname !== null && LOW_SIGNAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}
