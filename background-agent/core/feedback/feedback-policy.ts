import type { BackgroundAgentFeedbackType } from '../../schemas/background-agent-types'

export const ACCEPTED_BACKGROUND_AGENT_FEEDBACK: readonly BackgroundAgentFeedbackType[] = [
  'useful',
  'not_relevant',
  'obvious',
  'weak_evidence',
  'badly_timed',
] as const

const BACKGROUND_AGENT_FEEDBACK_WEIGHTS: Record<BackgroundAgentFeedbackType, number> = {
  useful: 4,
  not_relevant: -6,
  obvious: -3,
  weak_evidence: -5,
  badly_timed: -2,
}

export function isBackgroundAgentFeedbackType(value: string): value is BackgroundAgentFeedbackType {
  return (ACCEPTED_BACKGROUND_AGENT_FEEDBACK as readonly string[]).includes(value)
}

export function getBackgroundAgentFeedbackWeight(value: BackgroundAgentFeedbackType): number {
  return BACKGROUND_AGENT_FEEDBACK_WEIGHTS[value]
}
