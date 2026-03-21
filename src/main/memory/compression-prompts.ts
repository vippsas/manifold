import type { MemoryInteraction, ToolUseEvent } from '../../shared/memory-types'

interface CompressionSessionContext {
  runtimeId: string
  branchName: string
  taskDescription?: string
}

export function buildCompressionPrompt(
  interactions: MemoryInteraction[],
  session: CompressionSessionContext,
  toolEvents?: ToolUseEvent[]
): string {
  const interactionLog = interactions
    .map((i) => `[${i.role}] ${i.text}`)
    .join('\n---\n')

  let toolSection = ''
  if (toolEvents && toolEvents.length > 0) {
    const toolLines = toolEvents
      .slice(0, 50) // cap to avoid blowing up prompt
      .map((e) => `  <tool name="${e.toolName}" target="${e.inputSummary}" />`)
      .join('\n')
    toolSection = `

<tool_usage>
${toolLines}
</tool_usage>

Use the tool usage above to inform which files were read, edited, or created.`
  }

  return `You are analyzing a coding agent session to extract structured knowledge.

Session info:
- Runtime: ${session.runtimeId}
- Branch: ${session.branchName}
${session.taskDescription ? `- Task: ${session.taskDescription}` : ''}

Below is the interaction log between the user and the coding agent.

<interaction_log>
${interactionLog}
</interaction_log>${toolSection}

Analyze this session and produce an XML response with the following structure:

<results>
  <summary>
    <taskDescription>What the user asked to be done</taskDescription>
    <whatWasDone>Concise description of what was accomplished</whatWasDone>
    <whatWasLearned>Key takeaways or lessons from this session</whatWasLearned>
    <decisionsMade>
      <decision>Notable decision or trade-off</decision>
    </decisionsMade>
    <filesChanged>
      <file>path/to/file</file>
    </filesChanged>
  </summary>
  <observations>
    <observation>
      <type>One of the valid types below</type>
      <title>Short descriptive title</title>
      <summary>1-2 sentence description</summary>
      <narrative>Full context paragraph explaining what happened, why, and what matters</narrative>
      <facts>
        <fact>Specific factual detail worth remembering</fact>
      </facts>
      <concepts>
        <concept>Concept tag from the list below</concept>
      </concepts>
      <filesTouched>
        <file>path/to/file</file>
      </filesTouched>
    </observation>
  </observations>
</results>

Valid observation types:
- bugfix: Bug found and fixed
- feature: New functionality added
- refactor: Code restructured without changing behavior
- change: General code modification
- discovery: Something learned or investigated
- decision: Notable choice or trade-off
- task_summary: Overall summary of the task
- architecture: Structural or design insight
- pattern: Recurring convention or best practice
- error_resolution: Error encountered and resolved

Valid concept tags (use 1-3 per observation):
- how-it-works: Understanding of system behavior
- what-changed: Description of a code change
- problem-solution: A problem and its resolution
- gotcha: Non-obvious pitfall or edge case
- pattern: Recurring code pattern or convention
- trade-off: Explicit trade-off between alternatives
- why-it-exists: Rationale behind a design choice

Extract observations for each distinct piece of knowledge. Respond with ONLY the XML, no explanation.`
}
