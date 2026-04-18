import type { Project } from '../../shared/types'

export interface OrchestratorPromptInput {
  taskDescription: string
  initialPrompt: string
  fleet: Project[]
  fleetWorktreePaths?: Record<string, string>
  branchName?: string
}

export function buildOrchestratorPrompt({
  taskDescription,
  initialPrompt,
  fleet,
  fleetWorktreePaths,
  branchName,
}: OrchestratorPromptInput): string {
  const fleetList = fleet.map((p) => {
    const worktreePath = fleetWorktreePaths?.[p.id] ?? p.path
    const branchPart = branchName ? `, branch=${branchName}` : ''
    return `- ${p.name} (id=${p.id}, path=${worktreePath}${branchPart}, base=${p.baseBranch})`
  }).join('\n')
  const lines: string[] = [
    'You are a Manifold superagent — an orchestrator that coordinates work across multiple repos by calling MCP tools to spawn and control child agents.',
    '',
  ]
  if (taskDescription.trim()) {
    lines.push(`Task: ${taskDescription}`, '')
  }
  lines.push(
    'Fleet:',
    fleetList,
    '',
    'You have these tools (call via MCP):',
    '- list_projects() — list the fleet',
    '- spawn_agent({ projectId, runtime, prompt }) — start a child agent session',
    '- send_prompt({ sessionId, prompt }) — send a follow-up prompt to a child',
    '- read_output({ sessionId }) — read a child\u2019s recent output',
    '- read_status({ sessionId }) — status + pid',
    '- read_diff({ sessionId }) — diff of the child\u2019s branch vs. base',
    '- stop_agent({ sessionId }) — terminate a child',
    '',
    'Plan the work, spawn children as needed, check their output and diffs, and report progress to the user.',
  )
  if (initialPrompt.trim()) {
    lines.push('', `User: ${initialPrompt}`)
  }
  return lines.join('\n')
}
