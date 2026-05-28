import type { MemoryInteraction, MemoryObservation } from '../../shared/memory-types'

export const VALID_OBSERVATION_TYPES = new Set([
  'bugfix', 'feature', 'refactor', 'change', 'discovery',
  'decision', 'task_summary', 'architecture', 'pattern', 'error_resolution',
])

export const VALID_CONCEPTS = new Set([
  'how-it-works', 'what-changed', 'problem-solution',
  'gotcha', 'pattern', 'trade-off', 'why-it-exists',
])

export function detectObservationType(text: string): MemoryObservation['type'] {
  const lower = text.toLowerCase()
  if (/\b(error|bug|fix|crash|fail|exception|stack\s*trace|broken)\b/.test(lower)) return 'bugfix'
  if (/\b(add|implement|new|create|feature|introduce)\b/.test(lower)) return 'feature'
  if (/\b(refactor|extract|rename|cleanup|reorganize|restructure)\b/.test(lower)) return 'refactor'
  if (/\b(discover|learn|realize|understand|investigate|found out)\b/.test(lower)) return 'discovery'
  if (/\b(architect|design|structure|module|layer|system)\b/.test(lower)) return 'architecture'
  if (/\b(decide|choice|trade.?off|alternative|instead of|chose|option)\b/.test(lower)) return 'decision'
  if (/\b(convention|pattern|always|never|rule|best practice)\b/.test(lower)) return 'pattern'
  if (/\b(change|update|modify|edit|alter)\b/.test(lower)) return 'change'
  return 'task_summary'
}

export function detectConcepts(text: string): string[] {
  const lower = text.toLowerCase()
  const concepts: string[] = []

  if (/\b(how|works|behavior|mechanism|flow|process)\b/.test(lower)) concepts.push('how-it-works')
  if (/\b(change|update|modify|add|remove|rename)\b/.test(lower)) concepts.push('what-changed')
  if (/\b(fix|bug|error|issue|problem|resolve|solution)\b/.test(lower)) concepts.push('problem-solution')
  if (/\b(gotcha|caveat|careful|watch out|pitfall|edge case|subtle)\b/.test(lower)) concepts.push('gotcha')
  if (/\b(pattern|convention|always|never|rule|practice)\b/.test(lower)) concepts.push('pattern')
  if (/\b(trade.?off|instead|versus|chose|alternative|pros|cons)\b/.test(lower)) concepts.push('trade-off')
  if (/\b(because|reason|why|rationale|purpose|designed to)\b/.test(lower)) concepts.push('why-it-exists')

  return concepts.slice(0, 3)
}

export function scoreInteractionForSummary(interaction: MemoryInteraction): number {
  let score = Math.min(interaction.text.length, 320)

  if (interaction.role === 'user') score += 200
  if (/[.?!]/.test(interaction.text)) score += 30
  if (/\b(fix|fixed|updated|added|implemented|resolved|root cause|patch|changed|commit|pull request|pr)\b/i.test(interaction.text)) {
    score += 80
  }
  if (/^\s*(>|sh:|npm|pnpm|yarn|vitest|tsc|jest|cargo|go test)\b/im.test(interaction.text)) {
    score -= 160
  }
  if (interaction.text.includes('\n')) score -= 20

  return score
}
