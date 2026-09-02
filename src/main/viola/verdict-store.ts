import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The reviewer's structured verdict, exchanged through a file in its own scratch worktree.
 *
 * A verdict has to be machine-readable, and a worker that runs as a visible terminal reports
 * through a TUI: its scrollback is screen redraws and box drawing, so hunting a JSON object in
 * that text is guesswork. A file is exact, and it works the same whichever mode the worker runs in.
 */
export interface ViolaVerdictStore {
  /** Absolute path the reviewer is told to write. */
  path(worktreePath: string, taskId: string): string
  /** Removes any previous verdict, so a re-review cannot read the stale one. */
  clear(worktreePath: string, taskId: string): Promise<void>
  /** The verdict text, or null when the reviewer wrote none. */
  read(worktreePath: string, taskId: string): Promise<string | null>
}

export function createViolaVerdictStore(): ViolaVerdictStore {
  const filePath = (worktreePath: string, taskId: string): string => (
    join(worktreePath, '.viola', `review-${taskId}.json`)
  )
  return {
    path: filePath,
    async clear(worktreePath, taskId) {
      await rm(filePath(worktreePath, taskId), { force: true })
    },
    async read(worktreePath, taskId) {
      try {
        const text = await readFile(filePath(worktreePath, taskId), 'utf8')
        return text.trim() ? text : null
      } catch {
        return null
      }
    },
  }
}
