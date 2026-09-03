import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

/** What entering a workspace has to change besides the active workspace id.
 *
 *  `keep` means the agent already on screen lives in this workspace, so nothing
 *  else moves. `agent` names the agent to show. `empty` is a workspace with no
 *  agent yet: select a folder and clear the agent, so the main view is that
 *  workspace's empty agent view rather than another workspace's agent. */
export type WorkspaceEntry =
  | { kind: 'keep' }
  | { kind: 'agent'; session: AgentSession }
  | { kind: 'empty'; projectId: string | null }

export interface WorkspaceEntryContext {
  workspaces: readonly Workspace[]
  sessionsByWorkspace: Record<string, AgentSession[]>
  activeSessionId: string | null
  activeProjectId: string | null
}

/**
 * Where the main view has to land when the user enters `workspaceId`.
 *
 * Two workspaces can span the same folders (a copy on a fresh worktree), so the
 * active project alone can't tell them apart — the agent has to be checked by
 * workspace membership. Shared by the sidebar row and the Favorites row (and
 * ⌘1–9), which otherwise disagreed: the favorite moved the active workspace and
 * folder but left the previous workspace's agent on screen, so entering it
 * looked like nothing happened.
 */
export function resolveWorkspaceEntry(
  workspaceId: string,
  ctx: WorkspaceEntryContext,
): WorkspaceEntry {
  const sessions = ctx.sessionsByWorkspace[workspaceId] ?? []
  if (ctx.activeSessionId && sessions.some((s) => s.id === ctx.activeSessionId)) return { kind: 'keep' }

  const target = sessions[0]
  if (target) return { kind: 'agent', session: target }

  const workspace = ctx.workspaces.find((w) => w.id === workspaceId)
  const projectId = ctx.activeProjectId && workspace?.projectIds.includes(ctx.activeProjectId)
    ? ctx.activeProjectId
    : workspace?.projectIds[0] ?? null
  return { kind: 'empty', projectId }
}
