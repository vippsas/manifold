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
  { type: 'weak_evidence', label: 'Weak Evidence' },
  { type: 'badly_timed', label: 'Bad Timing' },
]

interface BackgroundSuggestionCardProps {
  suggestion: BackgroundAgentSuggestion
  onFeedback: (suggestionId: string, feedbackType: BackgroundAgentFeedbackType) => Promise<void>
}

export function BackgroundSuggestionCard({
  suggestion,
  onFeedback,
}: BackgroundSuggestionCardProps): React.JSX.Element {
  const [selectedFeedback, setSelectedFeedback] = React.useState<BackgroundAgentFeedbackType | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleFeedback = React.useCallback(async (feedbackType: BackgroundAgentFeedbackType): Promise<void> => {
    setIsSubmitting(true)
    setError(null)
    try {
      await onFeedback(suggestion.id, feedbackType)
      setSelectedFeedback(feedbackType)
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError)
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [onFeedback, suggestion.id])

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

      {suggestion.evidence.length > 0 && (
        <ul style={s.evidenceList}>
          {suggestion.evidence.map((item, index) => (
            <li key={`${index}:${item}`} style={s.evidenceItem}>{item}</li>
          ))}
        </ul>
      )}

      {suggestion.supportingSources.length > 0 && (
        <div style={s.sourceList}>
          {suggestion.supportingSources.map((source) => (
            <div key={source.id} style={s.sourceItem}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                style={s.sourceLink}
              >
                {source.title}
              </a>
              <div style={s.sourceMeta}>
                {source.publishedAt ?? 'Date unknown'} · {source.type.replace(/_/g, ' ')} · {source.trust} trust
              </div>
              {source.note && <div style={s.sourceNote}>{source.note}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={s.feedbackRow}>
        {FEEDBACK_ACTIONS.map((action) => (
          <button
            key={action.type}
            type="button"
            aria-pressed={selectedFeedback === action.type}
            disabled={isSubmitting}
            onClick={() => void handleFeedback(action.type)}
            style={{
              ...s.feedbackButton,
              ...(selectedFeedback === action.type ? s.feedbackButtonActive : {}),
              ...(isSubmitting ? s.feedbackButtonDisabled : {}),
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      {error && <div style={s.feedbackError}>{error}</div>}
    </div>
  )
}
