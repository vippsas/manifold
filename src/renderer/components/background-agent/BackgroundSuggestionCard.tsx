import React from 'react'
import type {
  BackgroundAgentFeedbackType,
  BackgroundAgentSuggestion,
} from '../../../../background-agent/schemas/background-agent-types'
import { backgroundAgentPanelStyles as s } from './BackgroundAgentPanel.styles'

const CATEGORY_LABELS: Record<BackgroundAgentSuggestion['category'], string> = {
  feature_opportunity: 'Feature',
  architecture_improvement: 'Architecture',
  pattern_transfer: 'Pattern',
  ecosystem_shift: 'Ecosystem',
}

const FEEDBACK_ACTIONS: Array<{ type: BackgroundAgentFeedbackType; label: string }> = [
  { type: 'useful', label: 'Useful' },
  { type: 'not_relevant', label: 'Not Relevant' },
  { type: 'obvious', label: 'Obvious' },
]

interface BackgroundSuggestionCardProps {
  suggestion: BackgroundAgentSuggestion
  onFeedback: (suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => Promise<void>
}

export function BackgroundSuggestionCard({
  suggestion,
  onFeedback,
}: BackgroundSuggestionCardProps): React.JSX.Element {
  return (
    <div style={s.card}>
      <div style={s.cardHeader}>
        <div style={s.cardTitle}>{suggestion.title}</div>
        <div style={s.badge}>{CATEGORY_LABELS[suggestion.category]}</div>
      </div>

      <div style={s.bodyText}>{suggestion.summary}</div>
      <div style={s.bodyText}>{suggestion.whyItMatters}</div>
      {suggestion.whyNow && <div style={s.bodyText}>Why now: {suggestion.whyNow}</div>}

      <div style={s.statRow}>
        <span style={s.stat}>Confidence: {suggestion.confidence}</span>
        <span style={s.stat}>Novelty: {suggestion.novelty}</span>
        <span style={s.stat}>Impact: {suggestion.impact}</span>
        <span style={s.stat}>Effort: {suggestion.effort}</span>
      </div>

      {suggestion.supportingSources.length > 0 && (
        <div style={s.sourceList}>
          {suggestion.supportingSources.map((source) => (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              style={s.sourceLink}
            >
              {source.title}
            </a>
          ))}
        </div>
      )}

      <div style={s.feedbackRow}>
        {FEEDBACK_ACTIONS.map((action) => (
          <button
            key={action.type}
            type="button"
            style={s.feedbackButton}
            onClick={() => void onFeedback(suggestion.id, action.type)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
