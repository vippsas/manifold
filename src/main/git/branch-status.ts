import { gitExec } from './git-exec'

/** Local branch names merged into `baseBranch` (includes the base itself). */
export async function listMergedBranches(repoPath: string, baseBranch: string): Promise<string[]> {
  try {
    const out = await gitExec(['branch', '--merged', baseBranch, '--format=%(refname:short)'], repoPath)
    return out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  } catch {
    return []
  }
}

/** Branch names currently checked out in any worktree (the main checkout + every worktree). */
export async function listWorktreeBranches(repoPath: string): Promise<string[]> {
  try {
    const raw = await gitExec(['worktree', 'list', '--porcelain'], repoPath)
    const branches: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('branch ')) {
        branches.push(line.slice('branch '.length).trim().replace('refs/heads/', ''))
      }
    }
    return branches
  } catch {
    return []
  }
}

/** Map of every local branch → its last-commit ISO date, in ONE git call (avoids a
 *  per-branch `git log` spawn; repos can have hundreds of branches). */
export async function getBranchDates(repoPath: string): Promise<Record<string, string>> {
  try {
    const out = await gitExec(['for-each-ref', '--format=%(refname:short)%09%(committerdate:iso-strict)', 'refs/heads'], repoPath)
    const map: Record<string, string> = {}
    for (const line of out.split('\n')) {
      const tab = line.indexOf('\t')
      if (tab === -1) continue
      const name = line.slice(0, tab).trim()
      const date = line.slice(tab + 1).trim()
      if (name) map[name] = date
    }
    return map
  } catch {
    return {}
  }
}
