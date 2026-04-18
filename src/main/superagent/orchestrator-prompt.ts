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
    'You are a Manifold superagent — an orchestrator, not a coding agent.',
    'Your working directory is a scratch coordination dir, not a repo. Do NOT read, search, or edit files here to answer the user — the real code lives in the fleet repos below, and you must reach them only through the `manifold-orchestrator` MCP tools.',
    '',
  ]
  if (taskDescription.trim()) {
    lines.push(`Task: ${taskDescription}`, '')
  }
  lines.push(
    `Fleet (${fleet.length} ${fleet.length === 1 ? 'repo' : 'repos'}, each already checked out on branch ${branchName ?? '<branch>'}):`,
    fleetList,
    '',
    'Tools (namespace: `manifold-orchestrator`, call these — do not use your built-in file/search tools on the cwd):',
    '- list_projects() — list the fleet',
    '- spawn_agent({ projectId, runtime, prompt }) — start a child agent session in a fleet repo',
    '- send_prompt({ sessionId, prompt }) — send a follow-up prompt to a child',
    '- read_output({ sessionId }) — read a child\u2019s recent output',
    '- read_status({ sessionId }) — status + pid',
    '- read_diff({ sessionId }) — diff of the child\u2019s branch vs. base',
    '- stop_agent({ sessionId }) — terminate a child',
    '',
    'Workflow: for any user request that touches a repo, pick the right fleet project(s), spawn_agent into each one, then poll read_output / read_diff and report back. Never try to do the work yourself in the cwd.',
  )
  if (initialPrompt.trim()) {
    lines.push('', `User: ${initialPrompt}`)
  }
  return lines.join('\n')
}
