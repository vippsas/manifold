import type { VerdictStore } from '../store/verdict-store'
import type { VerdictRecord, TaskPrompt } from '../../shared/verdict-types'
import type { AiServiceSettings } from '../../shared/plugins/api-types'
import type { SessionUsage } from './transcript-usage-reader'

const FULL_THRESHOLD = 2048
const HEAD_TAIL_BYTES = 1024

export interface SessionCreatedEvent {
  sessionId: string
  projectId: string
  branch: string
  runtime: string
  taskPrompt: string
  worktreePath: string
  baseBranch: string
}

export interface VerdictRecorderDeps {
  store: VerdictStore
  getAiSettings: () => AiServiceSettings
  getDiffStats: (worktreePath: string, baseBranch: string) => Promise<{
    diffLines: { added: number; removed: number }
    filesChanged: number
  }>
  isBranchMerged: (worktreePath: string, baseBranch: string, branch: string) => Promise<boolean>
  // Resolves the PR from the worktree's CURRENT branch — the gh-create-pr flow
  // renames the branch, so the verdict's original branch name won't match.
  lookupPrUrl?: (worktreePath: string) => Promise<string | null>
  summarize: (middle: string, settings: AiServiceSettings) => Promise<string>
  // Resolve per-session token usage + turns at termination; null ⇒ runtime exposed none.
  resolveSessionUsage?: (ctx: SessionUsageResolveContext) => Promise<SessionUsage | null>
  // Synchronous usage resolver for the app-quit teardown path (no awaits survive quit).
  resolveSessionUsageSync?: (ctx: SessionUsageResolveContext) => SessionUsage | null
  now?: () => Date
}

export interface SessionUsageResolveContext {
  sessionId: string
  worktreePath: string
  runtime: string
  createdAtMs: number
  terminatedAtMs: number
}

interface ActiveSession {
  worktreePath: string
  baseBranch: string
  createdAtMs: number
  lastStatus: string
}

export class VerdictRecorder {
  private active = new Map<string, ActiveSession>()
  private readonly now: () => Date

  constructor(private readonly deps: VerdictRecorderDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  onSessionCreated(event: SessionCreatedEvent): void {
    const created = this.now()
    const existing = this.deps.store.getBySessionId(event.sessionId)
    // Idempotent: if a record already exists (e.g. session is being re-adopted
    // after an app restart via SessionDiscovery), preserve its metrics and
    // createdAt — only re-populate this.active so subsequent events flow.
    const record: VerdictRecord = existing ?? {
      sessionId: event.sessionId,
      projectId: event.projectId,
      branch: event.branch,
      runtime: event.runtime,
      taskPrompt: { kind: 'full', text: event.taskPrompt },
      outcome: 'unknown',
      createdAt: created.toISOString(),
      metrics: {
        agentCommits: 0,
        humanEdits: 0,
        diffLines: { added: 0, removed: 0 },
        filesChanged: 0,
      },
    }
    if (!existing) this.deps.store.upsert(record)
    const createdAtMs = existing
      ? new Date(existing.createdAt).getTime()
      : created.getTime()
    this.active.set(event.sessionId, {
      worktreePath: event.worktreePath,
      baseBranch: event.baseBranch,
      createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : created.getTime(),
      lastStatus: 'unknown',
    })
  }

  onStatus(sessionId: string, status: string): void {
    const tracked = this.active.get(sessionId)
    if (!tracked) return
    tracked.lastStatus = status
  }

  onFilesChanged(sessionId: string): void {
    const tracked = this.active.get(sessionId)
    if (!tracked) return
    if (tracked.lastStatus === 'running') return
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    this.deps.store.upsert({
      ...existing,
      metrics: { ...existing.metrics, humanEdits: existing.metrics.humanEdits + 1 },
    })
  }

  onAgentCommit(sessionId: string): void {
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    const next: VerdictRecord = {
      ...existing,
      metrics: { ...existing.metrics, agentCommits: existing.metrics.agentCommits + 1 },
    }
    if (next.outcome === 'unknown') next.outcome = 'committed_only'
    this.deps.store.upsert(next)
  }

  getDetectedPrUrl(sessionId: string): string | null {
    return this.deps.store.getBySessionId(sessionId)?.metrics.prUrl ?? null
  }

  onPrCreated(sessionId: string, prUrl: string): void {
    const existing = this.deps.store.getBySessionId(sessionId)
    if (!existing) return
    this.deps.store.upsert({
      ...existing,
      outcome: 'pr_created',
      metrics: { ...existing.metrics, prUrl },
    })
  }

  async onSessionTerminated(sessionId: string): Promise<void> {
    const existing = this.deps.store.getBySessionId(sessionId)
    const tracked = this.active.get(sessionId)
    if (!existing || !tracked) {
      this.active.delete(sessionId)
      return
    }

    const { diffLines, filesChanged } = await safe(
      () => this.deps.getDiffStats(tracked.worktreePath, tracked.baseBranch),
      { diffLines: existing.metrics.diffLines, filesChanged: existing.metrics.filesChanged },
    )

    const merged = await safe(
      () => this.deps.isBranchMerged(tracked.worktreePath, tracked.baseBranch, existing.branch),
      false,
    )

    // PR detection during the session only fires on commit-triggered polls, so a
    // PR opened after the agent's last commit goes uncaptured. Reconcile once at
    // termination via the worktree's current branch — `gh pr list --state all`
    // also catches already-merged PRs.
    const prUrl = existing.metrics.prUrl ?? (this.deps.lookupPrUrl
      ? (await safe(() => this.deps.lookupPrUrl!(tracked.worktreePath), null)) ?? undefined
      : undefined)

    const outcome = this.resolveTerminalOutcome(existing, merged, { diffLines, filesChanged }, Boolean(prUrl))
    const terminatedDate = this.now()
    const usage = this.deps.resolveSessionUsage
      ? await safe(() => this.deps.resolveSessionUsage!({
          sessionId,
          worktreePath: tracked.worktreePath,
          runtime: existing.runtime,
          createdAtMs: tracked.createdAtMs,
          terminatedAtMs: terminatedDate.getTime(),
        }), null)
      : null
    const taskPrompt = await this.maybeTruncatePrompt(existing.taskPrompt)

    this.deps.store.upsert({
      ...existing,
      taskPrompt,
      outcome,
      terminatedAt: terminatedDate.toISOString(),
      durationMs: terminatedDate.getTime() - tracked.createdAtMs,
      metrics: {
        ...existing.metrics,
        diffLines,
        filesChanged,
        prUrl,
        ...(usage ? { tokenUsage: usage.tokenUsage, turns: usage.turns } : {}),
      },
    })
    this.active.delete(sessionId)
  }

  /**
   * Finalize every still-active session synchronously for app quit. `before-quit`
   * kills PTYs without firing the natural `agent:exit` that drives
   * `onSessionTerminated`, so without this an active session's token/turn metrics
   * are lost on a normal quit — and chat-mode usage lives only in memory, so it is
   * unrecoverable. The async git/gh/diff reconciliation is skipped (no await
   * survives quit); the outcome is derived from already-recorded metrics. On the
   * next launch the session is re-adopted and a real termination reconciles the
   * rest. What must survive the quit is the usage + terminatedAt/durationMs.
   */
  finalizeAllForQuitSync(): void {
    for (const [sessionId, tracked] of this.active) {
      const existing = this.deps.store.getBySessionId(sessionId)
      if (!existing) continue
      const terminated = this.now()
      const usage = this.deps.resolveSessionUsageSync
        ? this.deps.resolveSessionUsageSync({
            sessionId,
            worktreePath: tracked.worktreePath,
            runtime: existing.runtime,
            createdAtMs: tracked.createdAtMs,
            terminatedAtMs: terminated.getTime(),
          })
        : null
      const outcome = this.resolveTerminalOutcome(
        existing,
        false,
        { diffLines: existing.metrics.diffLines, filesChanged: existing.metrics.filesChanged },
        Boolean(existing.metrics.prUrl),
      )
      this.deps.store.upsert({
        ...existing,
        outcome,
        terminatedAt: terminated.toISOString(),
        durationMs: terminated.getTime() - tracked.createdAtMs,
        metrics: {
          ...existing.metrics,
          ...(usage ? { tokenUsage: usage.tokenUsage, turns: usage.turns } : {}),
        },
      })
    }
    this.active.clear()
  }

  private resolveTerminalOutcome(
    record: VerdictRecord,
    merged: boolean,
    fresh: { diffLines: { added: number; removed: number }; filesChanged: number },
    hasPr: boolean,
  ): VerdictRecord['outcome'] {
    // A branch with no commits of its own is trivially an ancestor of its base,
    // so `isBranchMerged` reports a phantom "merged" for sessions that produced
    // nothing — yielding "no activity" rows that still claim MERGED. Only trust
    // the merged signal when the session actually produced work.
    const hadActivity =
      record.metrics.agentCommits > 0 ||
      record.metrics.humanEdits > 0 ||
      fresh.filesChanged > 0 ||
      fresh.diffLines.added > 0 ||
      fresh.diffLines.removed > 0
    if (merged && hadActivity) return 'merged'
    if (record.outcome === 'pr_created' || hasPr) return 'pr_created'
    if (record.metrics.agentCommits > 0) return 'committed_only'
    return 'discarded'
  }

  private async maybeTruncatePrompt(prompt: TaskPrompt): Promise<TaskPrompt> {
    if (prompt.kind !== 'full') return prompt
    const text = prompt.text
    if (text.length <= FULL_THRESHOLD) return prompt
    const head = text.slice(0, HEAD_TAIL_BYTES)
    const tail = text.slice(-HEAD_TAIL_BYTES)
    const middle = text.slice(HEAD_TAIL_BYTES, -HEAD_TAIL_BYTES)
    const middleSummary = await safe(
      () => this.deps.summarize(middle, this.deps.getAiSettings()),
      `[middle omitted — ${middle.length} chars]`,
    )
    return { kind: 'truncated', head, middleSummary, tail, originalLength: text.length }
  }
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}
