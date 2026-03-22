import type {
  MemoryInteraction,
  MemoryObservation,
  SessionSummary,
  ToolUseEvent,
} from '../../../shared/memory-types'

export function safeParseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function parseObservationRow(row: Record<string, unknown>): MemoryObservation {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    sessionId: row.sessionId as string,
    type: row.type as MemoryObservation['type'],
    title: row.title as string,
    summary: row.summary as string,
    narrative: (row.narrative as string) || '',
    facts: safeParseStringArray((row.facts as string) || '[]'),
    concepts: safeParseStringArray((row.concepts as string) || '[]'),
    filesTouched: safeParseStringArray((row.filesTouched as string) || '[]'),
    createdAt: row.createdAt as number,
  }
}

export function parseInteractionRow(row: Record<string, unknown>): MemoryInteraction {
  let toolEvents: ToolUseEvent[] = []
  try {
    toolEvents = JSON.parse((row.toolEvents as string) || '[]') as ToolUseEvent[]
  } catch {
    toolEvents = []
  }

  return {
    id: row.id as number,
    projectId: row.projectId as string,
    sessionId: row.sessionId as string,
    role: row.role as string,
    text: row.text as string,
    toolEvents,
    timestamp: row.timestamp as number,
  }
}

export function parseSessionSummaryRow(row: Record<string, unknown>): SessionSummary {
  return {
    id: row.id as string,
    projectId: row.projectId as string,
    sessionId: row.sessionId as string,
    runtimeId: row.runtimeId as string,
    branchName: row.branchName as string,
    taskDescription: row.taskDescription as string,
    whatWasDone: row.whatWasDone as string,
    whatWasLearned: row.whatWasLearned as string,
    decisionsMade: safeParseStringArray((row.decisionsMade as string) || '[]'),
    filesChanged: safeParseStringArray((row.filesChanged as string) || '[]'),
    createdAt: row.createdAt as number,
  }
}
