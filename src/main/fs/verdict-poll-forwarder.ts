import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VerdictRecorder } from '../session/verdict-recorder'

const execFileAsync = promisify(execFile)

export type HeadShaFn = (cwd: string) => Promise<string>

async function defaultHeadSha(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd })
  return stdout.trim()
}

/**
 * Watches git poll output for the FileWatcher and forwards two derived signals
 * to the verdict recorder: a new commit on the branch (HEAD sha changed) and a
 * generic "files changed" tick. Kept separate from FileWatcher so the watcher
 * stays focused on file/git status polling and rendering events.
 */
export class VerdictPollForwarder {
  private recorder: VerdictRecorder | null = null
  private readonly lastHeadSha: Map<string, string> = new Map()
  private readonly headShaFn: HeadShaFn

  constructor(headShaFn?: HeadShaFn) {
    this.headShaFn = headShaFn ?? defaultHeadSha
  }

  setRecorder(recorder: VerdictRecorder): void {
    this.recorder = recorder
  }

  async notifyGitChange(worktreePath: string, sessionId: string): Promise<void> {
    if (!this.recorder) return
    try {
      const head = await this.headShaFn(worktreePath)
      const previous = this.lastHeadSha.get(worktreePath)
      if (head && previous && head !== previous) {
        this.recorder.onAgentCommit(sessionId)
      }
      if (head) this.lastHeadSha.set(worktreePath, head)
    } catch {
      // Worktree may be gone or git may have failed — skip.
    }
    this.recorder.onFilesChanged(sessionId)
  }
}
