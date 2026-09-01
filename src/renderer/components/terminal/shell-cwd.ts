import type { Project } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

/** One folder a terminal in this workspace can run in: the workspace's own
 *  checkout of a member repo, or the folder itself for a passthrough member. */
export interface ShellFolder {
  projectId: string
  name: string
  path: string
}

function findWorkspace(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
): Workspace | undefined {
  return workspaces.find((w) => w.id === activeWorkspaceId)
    ?? workspaces.find((w) => !!activeProjectId && w.projectIds.includes(activeProjectId))
}

/** Every folder the Shell panel offers for a new terminal, in `projectIds`
 *  order — the workspace's checkout of each member, the clone where it owns
 *  none, and nothing at all for a member the registry has forgotten.
 *
 *  Members resolving to the *same* directory collapse to one entry, as VS Code
 *  shrinks its own pick list (`terminalActions.ts:1710`): two rows that would
 *  open the same shell are one choice, not two.
 *
 *  `activeProjectId` only helps find the workspace, never the folder — see
 *  `resolveShellCwd`. */
export function resolveShellFolders(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
  projects: Project[],
): ShellFolder[] {
  const workspace = findWorkspace(workspaces, activeWorkspaceId, activeProjectId)
  if (!workspace) return []
  const seen = new Set<string>()
  const folders: ShellFolder[] = []
  for (const projectId of workspace.projectIds) {
    const project = projects.find((p) => p.id === projectId)
    const path = workspace.worktreePaths?.[projectId] ?? project?.path
    if (!project || !path || seen.has(path)) continue
    seen.add(path)
    folders.push({ projectId, name: project.name, path })
  }
  return folders
}

/** The longest directory prefix every path shares, never a whole path itself. */
function commonDirPrefix(paths: string[]): string {
  if (paths.length < 2) return ''
  const segments = paths.map((p) => p.split('/'))
  let shared = 0
  while (
    shared < segments[0].length - 1
    && segments.every((s) => shared < s.length - 1 && s[shared] === segments[0][shared])
  ) shared++
  return segments[0].slice(0, shared).join('/')
}

/** What to show under a folder's name in the picker: its path with the prefix
 *  every offered folder shares removed, since that prefix is the one part that
 *  cannot tell them apart.
 *
 *  `undefined` when the remainder is just the name again — VS Code drops its
 *  pick description on the same test (`description !== label`), and a row that
 *  says "payments / payments" is noise. Callers keep the absolute path on the
 *  row's tooltip regardless. */
export function describeShellFolder(folder: ShellFolder, offered: ShellFolder[]): string | undefined {
  const prefix = commonDirPrefix(offered.map((f) => f.path))
  const rest = folder.path.slice(prefix.length).replace(/^\//, '')
  return rest === folder.name ? undefined : rest
}

/** Where the Shell panel's terminals run *by default*, and the key their set is
 *  stored under.
 *
 *  Deliberately a copy of the chain in `dock-agent-panel.tsx:131-147` rather
 *  than a shared extraction — reworking the agent panel is out of scope here.
 *
 *  The key always comes from the workspace's *primary* project. `activeProjectId`
 *  only helps find the workspace: selecting a different repo row inside a
 *  multi-repo workspace must not swap the terminal set. Which folder an
 *  individual terminal runs in is a per-tab choice on top of this
 *  (`resolveShellFolders`), so the set stays put while its tabs can differ. */
export function resolveShellCwd(
  workspaces: Workspace[],
  activeWorkspaceId: string | null | undefined,
  activeProjectId: string | null | undefined,
  projects: Project[],
): string | null {
  return resolveShellFolders(workspaces, activeWorkspaceId, activeProjectId, projects)[0]?.path ?? null
}
