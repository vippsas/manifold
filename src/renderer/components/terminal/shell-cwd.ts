import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

/** Where the Shell panel's terminals run, and the key their set is stored under.
 *
 *  Deliberately a copy of the chain in `dock-agent-panel.tsx:131-147` rather
 *  than a shared extraction — reworking the agent panel is out of scope here.
 *
 *  The path always comes from the workspace's *primary* project. `activeProjectId`
 *  only helps find the workspace: selecting a different repo row inside a
 *  multi-repo workspace must not swap the terminal set. */
export function resolveShellCwd(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
  projects: Project[],
): string | null {
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
    ?? workspaces.find((w) => !!activeProjectId && w.projectIds.includes(activeProjectId))
  if (!workspace) return null
  const primaryId = workspace.projectIds[0]
  return workspace.worktreePaths?.[primaryId]
    ?? projects.find((p) => p.id === primaryId)?.path
    ?? null
}
