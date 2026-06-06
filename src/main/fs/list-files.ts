import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const FILE_LIST_CAP = 10000

/**
 * Lists every tracked-or-untracked, non-ignored file in a worktree (VS Code's
 * Quick Open set) via `git ls-files`. Returns repo-relative paths. Caps the
 * result and logs when capped (no silent truncation); returns [] on any failure.
 */
export async function listWorktreeFiles(worktreePath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      // 16MB: ls-files emits the full file list before we cap it, so the buffer
      // must hold a large monorepo's output (the 10000 cap is applied after).
      { cwd: worktreePath, timeout: 10000, maxBuffer: 16 * 1024 * 1024 },
    )
    const files = stdout.split('\n').filter((line) => line.length > 0)
    if (files.length > FILE_LIST_CAP) {
      console.warn(`[files:list] ${worktreePath}: ${files.length} files, capping to ${FILE_LIST_CAP}`)
      return files.slice(0, FILE_LIST_CAP)
    }
    return files
  } catch (err) {
    console.warn(`[files:list] git ls-files failed in ${worktreePath}:`, err)
    return []
  }
}
