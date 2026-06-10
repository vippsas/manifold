import type { VerdictStore } from '../store/verdict-store'
import type { VerdictRecord, TaskPrompt } from '../../shared/verdict-types'
import type { AiServiceSettings } from '../../shared/watch-types'

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
  summarize: (middle: string, settings: AiServiceSettings) => Promise<string>
  now?: () => Date
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

    const outcome = this.resolveTerminalOutcome(existing, merged)
    const terminatedDate = this.now()
    const taskPrompt = await this.maybeTruncatePrompt(existing.taskPrompt)

    this.deps.store.upsert({
      ...existing,
      taskPrompt,
      outcome,
      terminatedAt: terminatedDate.toISOString(),
      durationMs: terminatedDate.getTime() - tracked.createdAtMs,
      metrics: { ...existing.metrics, diffLines, filesChanged },
    })
    this.active.delete(sessionId)
  }

  private resolveTerminalOutcome(record: VerdictRecord, merged: boolean): VerdictRecord['outcome'] {
    if (merged) return 'merged'
    if (record.outcome === 'pr_created') return 'pr_created'
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
