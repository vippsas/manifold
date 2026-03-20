import type { MemoryInteraction } from '../../shared/memory-types'

interface CompressionSessionContext {
  runtimeId: string
  branchName: string
  taskDescription?: string
}

export function buildCompressionPrompt(
  interactions: MemoryInteraction[],
  session: CompressionSessionContext
): string {
  const interactionLog = interactions
    .map((i) => `[${i.role}] ${i.text}`)
    .join('\n---\n')

  return `You are analyzing a coding agent session to extract structured knowledge.

Session info:
- Runtime: ${session.runtimeId}
- Branch: ${session.branchName}
${session.taskDescription ? `- Task: ${session.taskDescription}` : ''}

Below is the interaction log between the user and the coding agent.

<interaction_log>
${interactionLog}
</interaction_log>

Analyze this session and produce a JSON object with two top-level keys:

1. "summary" — an object with these fields:
   - "taskDescription": string — what the user asked to be done
   - "whatWasDone": string — concise description of what was accomplished
   - "whatWasLearned": string — key takeaways or lessons from this session
   - "decisionsMade": string[] — list of notable decisions or trade-offs
   - "filesChanged": string[] — list of file paths that were modified

2. "observations" — an array of objects, each with:
   - "type": one of "task_summary", "decision", "error_resolution", "architecture", "pattern"
   - "title": string — short descriptive title
   - "summary": string — 1-2 sentence description
   - "facts": string[] — specific factual details worth remembering
   - "filesTouched": string[] — file paths relevant to this observation

Extract the following kinds of knowledge:
- Task summary: what was the goal and outcome
- Decisions made: any notable choices, trade-offs, or rejected alternatives
- Errors resolved: bugs found and how they were fixed
- Architecture insights: structural patterns or design decisions discovered
- Patterns: recurring code patterns, conventions, or best practices observed

Respond with ONLY the JSON object, no markdown fencing or explanation.`
}
