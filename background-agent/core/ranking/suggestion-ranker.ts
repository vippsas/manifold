import type {
  BackgroundAgentFeedbackEvent,
  BackgroundAgentProjectProfile,
  BackgroundAgentSuggestion,
} from '../../schemas/background-agent-types'
import { getBackgroundAgentFeedbackWeight } from '../feedback/feedback-policy'
import { hasMinimumEvidence } from '../research/source-policy'

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'it',
  'now', 'of', 'on', 'or', 'our', 'that', 'the', 'this', 'to', 'using', 'we', 'with', 'your',
])

export interface RankSuggestionsOptions {
  limit?: number
  profile?: BackgroundAgentProjectProfile | null
  feedbackEvents?: BackgroundAgentFeedbackEvent[]
}

export function rankSuggestions(
  suggestions: BackgroundAgentSuggestion[],
  options: RankSuggestionsOptions = {},
): BackgroundAgentSuggestion[] {
  const limit = Math.max(1, Math.min(5, options.limit ?? 5))
  const profileTokens = tokenizeProfile(options.profile ?? null)
  const feedbackBySuggestionId = groupFeedbackEvents(options.feedbackEvents ?? [])

  return [...suggestions]
    .filter((suggestion) => hasMinimumEvidence(suggestion.supportingSources))
    .sort((left, right) => {
      const leftScore = scoreSuggestion(left, profileTokens, feedbackBySuggestionId.get(left.id) ?? [])
      const rightScore = scoreSuggestion(right, profileTokens, feedbackBySuggestionId.get(right.id) ?? [])
      if (leftScore !== rightScore) {
        return rightScore - leftScore
      }
      return right.createdAt.localeCompare(left.createdAt)
    })
    .slice(0, limit)
}

function scoreSuggestion(
  suggestion: BackgroundAgentSuggestion,
  profileTokens: Set<string>,
  feedbackEvents: BackgroundAgentFeedbackEvent[],
): number {
  return (
    scoreRelevance(suggestion, profileTokens) * 5 +
    scoreEvidenceQuality(suggestion) * 4 +
    scoreLevel(suggestion.confidence) * 3 +
    scoreLevel(suggestion.impact) * 3 +
    scoreLevel(suggestion.novelty) * 2 +
    scoreFeasibility(suggestion) * 2 +
    scoreTimeliness(suggestion) * 2 +
    scoreFeedback(feedbackEvents)
  )
}

function scoreLevel(level: BackgroundAgentSuggestion['confidence']): number {
  switch (level) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function scoreFeasibility(suggestion: BackgroundAgentSuggestion): number {
  switch (suggestion.effort) {
    case 'low':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function scoreEvidenceQuality(suggestion: BackgroundAgentSuggestion): number {
  const uniqueSources = new Set(suggestion.supportingSources.map((source) => source.url)).size
  const highTrustCount = suggestion.supportingSources.filter((source) => source.trust === 'high').length
  const noteCount = suggestion.supportingSources.filter((source) => source.note && source.note.trim()).length
  return Math.min(4, highTrustCount + Math.max(0, uniqueSources - 1) + Math.min(1, noteCount))
}

function scoreTimeliness(suggestion: BackgroundAgentSuggestion): number {
  const hasWhyNow = Boolean(suggestion.whyNow && suggestion.whyNow.trim())
  const mostRecentPublishedAt = suggestion.supportingSources
    .map((source) => source.publishedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

  if (mostRecentPublishedAt) {
    const ageInDays = Math.floor((Date.now() - Date.parse(mostRecentPublishedAt)) / 86_400_000)
    if (hasWhyNow && ageInDays <= 180) return 3
    if (hasWhyNow || ageInDays <= 180) return 2
    if (ageInDays <= 365) return 1
  }

  return hasWhyNow ? 1 : 0
}

function scoreRelevance(
  suggestion: BackgroundAgentSuggestion,
  profileTokens: Set<string>,
): number {
  if (profileTokens.size === 0) return 1

  const suggestionTokens = tokenizeText([
    suggestion.title,
    suggestion.summary,
    suggestion.whyItMatters,
    suggestion.whyNow ?? '',
    ...suggestion.evidence,
  ].join(' '))

  let overlap = 0
  for (const token of suggestionTokens) {
    if (profileTokens.has(token)) overlap += 1
  }

  if (overlap >= 4) return 3
  if (overlap >= 2) return 2
  if (overlap >= 1) return 1
  return 0
}

function scoreFeedback(events: BackgroundAgentFeedbackEvent[]): number {
  const total = events.reduce((sum, event) => sum + getBackgroundAgentFeedbackWeight(event.feedbackType), 0)
  return clamp(total, -8, 4)
}

function groupFeedbackEvents(events: BackgroundAgentFeedbackEvent[]): Map<string, BackgroundAgentFeedbackEvent[]> {
  const grouped = new Map<string, BackgroundAgentFeedbackEvent[]>()
  for (const event of events) {
    const current = grouped.get(event.suggestionId)
    if (current) {
      current.push(event)
    } else {
      grouped.set(event.suggestionId, [event])
    }
  }
  return grouped
}

function tokenizeProfile(profile: BackgroundAgentProjectProfile | null): Set<string> {
  if (!profile) return new Set()
  return tokenizeText([
    profile.projectName,
    profile.summary,
    profile.productType ?? '',
    profile.targetUser ?? '',
    profile.architectureShape ?? '',
    ...profile.majorWorkflows,
    ...profile.dependencyStack,
    ...profile.openQuestions,
    ...profile.recentChanges,
  ].join(' '))
}

function tokenizeText(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
