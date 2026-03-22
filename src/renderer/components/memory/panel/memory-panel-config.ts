import type { MemorySearchResult, MemoryTimelineItem, ObservationType } from '../../../../shared/memory-types'

export const OBSERVATION_TYPES: ObservationType[] = [
  'task_summary',
  'decision',
  'error_resolution',
  'architecture',
  'pattern',
  'bugfix',
  'feature',
  'refactor',
  'discovery',
  'change',
]

export const OBSERVATION_TYPE_LABELS: Record<ObservationType, string> = {
  task_summary: 'Summary',
  decision: 'Decision',
  error_resolution: 'Error Fix',
  architecture: 'Architecture',
  pattern: 'Pattern',
  bugfix: 'Bug Fix',
  feature: 'Feature',
  refactor: 'Refactor',
  discovery: 'Discovery',
  change: 'Change',
}

export const OBSERVATION_CONCEPTS = [
  { value: 'how-it-works', label: 'How it works' },
  { value: 'what-changed', label: 'What changed' },
  { value: 'problem-solution', label: 'Problem/Solution' },
  { value: 'gotcha', label: 'Gotcha' },
  { value: 'pattern', label: 'Pattern' },
  { value: 'trade-off', label: 'Trade-off' },
  { value: 'why-it-exists', label: 'Why it exists' },
] as const

export const MEMORY_SOURCE_LABELS: Record<MemoryTimelineItem['source'] | MemorySearchResult['source'], string> = {
  observation: 'Observation',
  session_summary: 'Session',
  interaction: 'Message',
}

export function formatMemoryTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
