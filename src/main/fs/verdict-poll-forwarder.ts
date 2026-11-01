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

interface SessionObservation {
  head?: string
  pending?: Promise<void>
}

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
  private readonly observations = new Map<string, Map<string, SessionObservation>>()
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
  evict(worktreePath: string, sessionId?: string): void {
    if (sessionId === undefined) this.observations.delete(worktreePath)
    else this.observations.get(worktreePath)?.delete(sessionId)
  }

  clear(): void { this.observations.clear() }

  async notifyGitChange(
    worktreePath: string, sessionId: string, isSubscribed: () => boolean = () => true,
    filesChanged = true,
  ): Promise<void> {
    const recorder = this.recorder
    if (!recorder || !isSubscribed()) return
    let sessions = this.observations.get(worktreePath)
    if (!sessions) {
      sessions = new Map()
      this.observations.set(worktreePath, sessions)
    }
    let observation = sessions.get(sessionId)
    if (!observation) {
      observation = {}
      sessions.set(sessionId, observation)
    }
    const current = observation
    const active = (): boolean => isSubscribed()
      && this.observations.get(worktreePath)?.get(sessionId) === current
    const notify = async (): Promise<void> => {
      if (!active()) return
      let shouldPollPr = false
      try {
        const head = await this.headShaFn(worktreePath)
        if (!active()) return
        const previous = current.head
        if (head && previous && head !== previous) {
          recorder.onAgentCommit(sessionId)
          shouldPollPr = true
        } else if (head && !previous) {
          // First observation for this subscription — check once for a pre-existing PR
          // (e.g. session resumed after restart, PR already exists).
          shouldPollPr = true
        }
        if (head) current.head = head
      } catch {
        // Worktree may be gone or git may have failed — skip.
      }
      if (!active()) return
      if (filesChanged) recorder.onFilesChanged(sessionId)

      if (shouldPollPr && !recorder.getDetectedPrUrl(sessionId)) {
        try {
          const branch = await this.branchFn(worktreePath)
          if (!active()) return
          if (branch && branch !== 'HEAD') {
            const url = await this.prLookupFn(worktreePath, branch)
            if (url && active()) recorder.onPrCreated(sessionId, url)
          }
        } catch {
          // gh missing, auth, or no PR — silent. Will retry on next HEAD change.
        }
      }
    }
    // Cached joins and changed ticks may overlap; preserve this session's HEAD
    // observation order without delaying renderer updates or other subscribers.
    const pending = (observation.pending ?? Promise.resolve()).then(notify)
    observation.pending = pending.catch(() => {})
    await pending
  }
}
