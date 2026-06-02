import { isGitProject } from '../../shared/project-kind'

export interface WorktreeSetManager {
  createWorktree: (projectPath: string, baseBranch: string, projectName: string, branchName?: string) => Promise<{ branch: string; path: string }>
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>
  branchExists: (projectPath: string, branch: string) => Promise<boolean>
}

export interface WorkspaceProject {
  id: string
  path: string
  name: string
  baseBranch: string
  kind?: 'git' | 'folder'
}

export interface WorkspaceWorkingSet {
  primary: string
  additionalDirs: string[]
  /** projectId -> worktree path (or folder path for non-git projects). */
  worktreePaths: Record<string, string>
}

/** Find a branch name unused across every git repo in the set (base, base-2, base-3, …). */
export async function findAvailableWorkspaceBranch(
  worktreeManager: Pick<WorktreeSetManager, 'branchExists'>,
  projects: readonly WorkspaceProject[],
  baseBranch: string,
): Promise<string> {
  const isFree = async (candidate: string): Promise<boolean> => {
    for (const project of projects) {
      if (!isGitProject(project)) continue
      if (await worktreeManager.branchExists(project.path, candidate)) return false
    }
    return true
  }
  if (await isFree(baseBranch)) return baseBranch
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseBranch}-${i}`
    if (await isFree(candidate)) return candidate
  }
  throw new Error(`Could not find an unused branch name starting from ${baseBranch}`)
}

/** Create a worktree on `branchName` for each git repo; non-git folders pass through. */
export async function buildWorkspaceWorkingSet(
  worktreeManager: WorktreeSetManager,
  projects: WorkspaceProject[],
  branchName: string,
): Promise<WorkspaceWorkingSet> {
  const created: { projectPath: string; worktreePath: string }[] = []
  const worktreePaths: Record<string, string> = {}
  try {
    for (const project of projects) {
      if (!isGitProject(project)) {
        worktreePaths[project.id] = project.path
        continue
      }
      const info = await worktreeManager.createWorktree(project.path, project.baseBranch, project.name, branchName)
      created.push({ projectPath: project.path, worktreePath: info.path })
      worktreePaths[project.id] = info.path
    }
  } catch (err) {
    for (const { projectPath, worktreePath } of created) {
      try { await worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* ignore */ }
    }
    throw err
  }
  const ordered = projects.map((p) => worktreePaths[p.id])
  const [primary, ...additionalDirs] = ordered
  return { primary, additionalDirs, worktreePaths }
}

/** Remove every git worktree in the set; never touch non-git passthrough paths. */
export async function removeWorkspaceWorktrees(
  worktreeManager: Pick<WorktreeSetManager, 'removeWorktree'>,
  worktreePaths: Record<string, string>,
  getProjectPath: (projectId: string) => string | undefined,
): Promise<void> {
  for (const [projectId, worktreePath] of Object.entries(worktreePaths)) {
    const projectPath = getProjectPath(projectId)
    if (!projectPath) continue
    if (projectPath === worktreePath) continue // non-git passthrough — edited in place, never delete
    try { await worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* best-effort */ }
  }
}
