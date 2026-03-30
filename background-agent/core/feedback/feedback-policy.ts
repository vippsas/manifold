import type { BackgroundAgentFeedbackType } from '../../schemas/background-agent-types'

export const ACCEPTED_BACKGROUND_AGENT_FEEDBACK: readonly BackgroundAgentFeedbackType[] = [
  'useful',
  'not_relevant',
  'obvious',
  'weak_evidence',
  'badly_timed',
] as const

export function isBackgroundAgentFeedbackType(value: string): value is BackgroundAgentFeedbackType {
  return (ACCEPTED_BACKGROUND_AGENT_FEEDBACK as readonly string[]).includes(value)
}
