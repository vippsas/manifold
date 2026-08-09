import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { isWorktreeWorkspace } from '../../../shared/workspace-types'

/** Every agent hangs under a workspace, because every repo does. A workspace
 *  agent names its workspace outright; an agent started against a single repo is
 *  placed by whichever *home* workspace holds that repo.
 *
 *  Only home workspaces take in an unnamed agent. A worktree workspace owns a
 *  checkout of its own, and every agent cut for it names it (`session-creator.ts:224`),
 *  so an agent that names no workspace is by definition working in the repos'
 *  own clones — never in that checkout. Placing it by repo alone put it in both:
 *  a second workspace over the same folders ("New Workspace, Same Folders")
 *  adopted the clone's agent, became its `primarySession`, and so opened on
 *  another workspace's agent — the wrong branch, the wrong folder — instead of
 *  the empty view offering to start one, with both sidebar rows lit for the one
 *  running agent. */
export function groupSessionsByWorkspace(
  sessionsByProject: Record<string, AgentSession[]>,
  workspaces: readonly Workspace[],
): Record<string, AgentSession[]> {
  const map: Record<string, AgentSession[]> = {}
  for (const sessions of Object.values(sessionsByProject ?? {})) {
    for (const session of sessions) {
      if (session.workspaceId) {
        (map[session.workspaceId] ??= []).push(session)
        continue
      }
      for (const workspace of workspaces) {
        if (isWorktreeWorkspace(workspace)) continue
        if (workspace.projectIds.includes(session.projectId)) (map[workspace.id] ??= []).push(session)
      }
    }
  }
  return map
}
