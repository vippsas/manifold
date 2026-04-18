export interface FleetWorktreeManager {
  createWorktree: (projectPath: string, baseBranch: string, projectName: string, branchName?: string) => Promise<{ branch: string; path: string }>
  removeWorktree: (projectPath: string, worktreePath: string) => Promise<void>
  branchExists: (projectPath: string, branch: string) => Promise<boolean>
}

export interface FleetProject {
  id: string
  path: string
  name: string
  baseBranch: string
}

export async function findAvailableFleetBranch(
  worktreeManager: Pick<FleetWorktreeManager, 'branchExists'>,
  fleet: readonly FleetProject[],
  baseBranch: string,
): Promise<string> {
  const isFree = async (candidate: string): Promise<boolean> => {
    for (const project of fleet) {
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

export async function createFleetWorktrees(
  worktreeManager: FleetWorktreeManager,
  fleet: FleetProject[],
  branchName: string,
): Promise<Record<string, string>> {
  const created: { projectPath: string; worktreePath: string }[] = []
  const result: Record<string, string> = {}
  try {
    for (const project of fleet) {
      const info = await worktreeManager.createWorktree(
        project.path,
        project.baseBranch,
        project.name,
        branchName,
      )
      created.push({ projectPath: project.path, worktreePath: info.path })
      result[project.id] = info.path
    }
    return result
  } catch (err) {
    // Best-effort rollback to avoid leaking worktrees on partial failure.
    for (const { projectPath, worktreePath } of created) {
      try { await worktreeManager.removeWorktree(projectPath, worktreePath) } catch { /* ignore */ }
    }
    throw err
  }
}

interface ChildSessionLike {
  worktreePath: string
  status: string
}

export function collectActiveChildWorktrees(
  childSessionIds: readonly string[],
  getSession: (id: string) => ChildSessionLike | null | undefined,
): Set<string> {
  const inUse = new Set<string>()
  for (const childId of childSessionIds) {
    const child = getSession(childId)
    if (child && child.status !== 'done' && child.status !== 'error') {
      inUse.add(child.worktreePath)
    }
  }
  return inUse
}

export async function killDormantChildren(
  childSessionIds: readonly string[],
  getSession: (id: string) => { status: string } | null | undefined,
  killSession: (id: string) => Promise<void>,
): Promise<void> {
  for (const childId of childSessionIds) {
    const child = getSession(childId)
    if (!child) continue
    if (child.status === 'done' || child.status === 'error') {
      try { await killSession(childId) } catch { /* best-effort */ }
    }
  }
}

export async function removeFleetWorktreesExcept(
  worktreeManager: FleetWorktreeManager,
  fleetWorktreePaths: Record<string, string>,
  getProjectPath: (projectId: string) => string | undefined,
  inUse: ReadonlySet<string>,
): Promise<void> {
  for (const [projectId, worktreePath] of Object.entries(fleetWorktreePaths)) {
    if (inUse.has(worktreePath)) continue
    const projectPath = getProjectPath(projectId)
    if (!projectPath) continue
    try {
      await worktreeManager.removeWorktree(projectPath, worktreePath)
    } catch {
      // Best-effort: worktree may already be gone.
    }
  }
}
