import type { BackgroundAgentSuggestion } from '../../schemas/background-agent-types'
import { hasMinimumEvidence } from '../research/source-policy'

export function rankSuggestions(
  suggestions: BackgroundAgentSuggestion[],
  limit = 5,
): BackgroundAgentSuggestion[] {
  return [...suggestions]
    .filter((suggestion) => hasMinimumEvidence(suggestion.supportingSources))
    .sort((left, right) => scoreSuggestion(right) - scoreSuggestion(left))
    .slice(0, limit)
}

function scoreSuggestion(suggestion: BackgroundAgentSuggestion): number {
  return (
    scoreLevel(suggestion.confidence) * 4 +
    scoreLevel(suggestion.impact) * 3 +
    scoreLevel(suggestion.novelty) * 2 -
    scoreLevel(suggestion.effort)
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
