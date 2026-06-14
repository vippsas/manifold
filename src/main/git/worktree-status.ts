import { gitExec } from './git-exec'

/** True when the worktree has uncommitted changes (staged or unstaged). */
export async function getWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const out = await gitExec(['status', '--porcelain'], worktreePath)
    return out.trim().length > 0
  } catch {
    return false
  }
}

/** ISO-8601 date of the worktree's last commit, or null if none / on error. */
export async function getWorktreeLastCommitISO(worktreePath: string): Promise<string | null> {
  try {
    const out = await gitExec(['log', '-1', '--format=%cI'], worktreePath)
    const trimmed = out.trim()
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}
