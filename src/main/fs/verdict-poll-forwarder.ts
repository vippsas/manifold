import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { VerdictRecorder } from '../session/verdict-recorder'

const execFileAsync = promisify(execFile)

// Cap each git/gh subprocess so a hung command (e.g. a stalled `gh pr list`
// network call) can't freeze the poll tick for that worktree forever (#537).
const EXEC_TIMEOUT_MS = 10000

export type HeadShaFn = (cwd: string) => Promise<string>
export type BranchFn = (cwd: string) => Promise<string>
export type PrLookupFn = (cwd: string, branch: string) => Promise<string | null>

async function defaultHeadSha(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, timeout: EXEC_TIMEOUT_MS })
  return stdout.trim()
}

async function defaultBranch(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: EXEC_TIMEOUT_MS })
  return stdout.trim()
}

/**
 * Find the PR (open, merged, or closed) whose head is `branch`. Shared with the
 * verdict recorder so a PR opened after the agent's last commit is still captured
 * when the session terminates, not only during commit-triggered polls.
 */
export async function lookupBranchPrUrl(cwd: string, branch: string): Promise<string | null> {
  // gh prints the PR URL on stdout when one exists, or exits non-zero / empty otherwise.
  // Use --state=all so we also catch already-merged/closed PRs that the user opened
  // from the shell — the recorder will still surface the URL on the verdict.
  const { stdout } = await execFileAsync(
    'gh',
    ['pr', 'list', '--head', branch, '--state', 'all', '--limit', '1', '--json', 'url', '--jq', '.[0].url'],
    { cwd, timeout: EXEC_TIMEOUT_MS },
  )
  const trimmed = stdout.trim()
  return trimmed.startsWith('http') ? trimmed : null
}

/**
 * Find the PR for a worktree by its CURRENT branch (HEAD), not a remembered name.
 * The gh-create-pr flow renames the branch to describe the fix (e.g.
 * `manifold/i754` → `redesign-welcome-dialog`), so the verdict's original branch
 * never matches the PR head — only the worktree's live branch does. Used by the
 * verdict recorder to reconcile the PR once the session ends.
 */
export async function lookupWorktreePrUrl(cwd: string): Promise<string | null> {
  try {
    const branch = await defaultBranch(cwd)
    if (!branch || branch === 'HEAD') return null
    return await lookupBranchPrUrl(cwd, branch)
  } catch {
    return null
  }
}

/**
 * Watches git poll output for the FileWatcher and forwards three derived signals
 * to the verdict recorder: a new commit on the branch (HEAD sha changed), a
 * generic "files changed" tick, and a PR URL detection (e.g. when the user runs
 * `gh pr create` in the shell terminal rather than the in-app PR panel). Kept
 * separate from FileWatcher so the watcher stays focused on file/git status
 * polling and rendering events.
 */
export class VerdictPollForwarder {
  private recorder: VerdictRecorder | null = null
  private readonly lastHeadSha: Map<string, string> = new Map()
  private readonly headShaFn: HeadShaFn
  private readonly branchFn: BranchFn
  private readonly prLookupFn: PrLookupFn

  constructor(headShaFn?: HeadShaFn, branchFn?: BranchFn, prLookupFn?: PrLookupFn) {
    this.headShaFn = headShaFn ?? defaultHeadSha
    this.branchFn = branchFn ?? defaultBranch
    this.prLookupFn = prLookupFn ?? lookupBranchPrUrl
  }

  setRecorder(recorder: VerdictRecorder): void {
    this.recorder = recorder
  }

  /**
   * Drop the cached HEAD sha for a worktree when it stops being watched. Prevents
   * a small leak and stops a recreated path from reusing a stale sha (which would
   * fire a spurious onAgentCommit) (#537).
   */
  evict(worktreePath: string): void {
    this.lastHeadSha.delete(worktreePath)
  }

  async notifyGitChange(worktreePath: string, sessionId: string): Promise<void> {
    if (!this.recorder) return
    let shouldPollPr = false
    try {
      const head = await this.headShaFn(worktreePath)
      const previous = this.lastHeadSha.get(worktreePath)
      if (head && previous && head !== previous) {
        this.recorder.onAgentCommit(sessionId)
        shouldPollPr = true
      } else if (head && !previous) {
        // First observation for this worktree — check once for a pre-existing PR
        // (e.g. session resumed after restart, PR already exists).
        shouldPollPr = true
      }
      if (head) this.lastHeadSha.set(worktreePath, head)
    } catch {
      // Worktree may be gone or git may have failed — skip.
    }
    this.recorder.onFilesChanged(sessionId)

    if (shouldPollPr && !this.recorder.getDetectedPrUrl(sessionId)) {
      try {
        const branch = await this.branchFn(worktreePath)
        if (branch && branch !== 'HEAD') {
          const url = await this.prLookupFn(worktreePath, branch)
          if (url) this.recorder.onPrCreated(sessionId, url)
        }
      } catch {
        // gh missing, auth, or no PR — silent. Will retry on next HEAD change.
      }
    }
  }
}
