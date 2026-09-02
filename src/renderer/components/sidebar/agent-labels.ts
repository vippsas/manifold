import type { AgentSession, Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  viola: 'Viola',
}

export function formatBranch(branchName: string): string {
  return branchName.replace(/^manifold\//, '')
}

export function repoPrefix(projectPath: string): string {
  const repoName = projectPath.split(/[\\/]/).filter(Boolean).pop()?.toLowerCase() ?? ''
  return repoName ? `${repoName}/` : ''
}

export function formatBranchLabel(branchName: string, projectPath: string): string {
  const prefix = repoPrefix(projectPath)

  if (prefix && branchName.toLowerCase().startsWith(prefix)) {
    return branchName.slice(prefix.length)
  }

  return formatBranch(branchName)
}

export function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

/**
 * The first of `Claude`, `Claude 2`, `Claude 3`… that no agent in the workspace
 * is already called.
 *
 * It checks the names in use rather than counting the agents of a runtime, which
 * is what the count it replaced got wrong: delete the middle of `Claude`,
 * `Claude 2`, `Claude 3` and the count falls back to 2, so the next agent is
 * named `Claude 3` on top of the one still open. Renaming an agent broke it the
 * same way — the agent still counted, but no longer held the name.
 *
 * Every sibling is checked, not just the ones sharing a runtime, so a Codex
 * agent someone renamed to `Claude 2` still pushes the next Claude to `Claude 3`.
 */
export function nextAgentName(
  runtimeId: string,
  siblings: readonly Pick<AgentSession, 'displayName'>[],
): string {
  const taken = new Set(
    siblings
      .map((session) => session.displayName?.trim())
      .filter((name): name is string => Boolean(name)),
  )
  const base = runtimeLabel(runtimeId)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

export interface WorkspaceRowLabel {
  /** Dimmed leading segment; null when it would only repeat the name. */
  repo: string | null
  /** The workspace's own name, with a redundant repo prefix removed. */
  name: string
}

/** What a sidebar workspace row reads as: the repo it belongs to, dimmed, then
 *  its own name — `kong / moss`.
 *
 *  The repo comes from projectIds[0], never from parsing the name. Only some
 *  stored names carry their branch prefix — a promoted worktree keeps whatever
 *  `workspaceNameFor` left behind, and a home workspace is named after its repo
 *  outright — so the name alone cannot say which repo a row belongs to. */
export function workspaceRowLabel(workspace: Workspace, projects: Project[]): WorkspaceRowLabel {
  const primary = projects.find((p) => p.id === workspace.projectIds[0])
  if (!primary) return { repo: null, name: workspace.name }

  const extra = workspace.projectIds.length - 1
  const repo = extra > 0 ? `${primary.name} +${extra}` : primary.name

  // Derived from the path, the way the branch namer derives it, so the strip
  // matches the prefix the branch actually carries.
  const prefix = repoPrefix(primary.path)
  const name = prefix && workspace.name.toLowerCase().startsWith(prefix)
    ? workspace.name.slice(prefix.length)
    : workspace.name

  // A home workspace is named after its repo; saying it twice adds nothing.
  return name.toLowerCase() === repo.toLowerCase() ? { repo: null, name } : { repo, name }
}
