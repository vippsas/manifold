import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from './verdict-recorder'
import type { AiServiceSettings } from '../../shared/plugins/api-types'

function makeRecorder(tmp: string, opts: Partial<{
  diffLines: { added: number; removed: number }
  filesChanged: number
  isBranchMerged: boolean
  lookupPrUrl: string | null
  aiSettings: AiServiceSettings
  summarizer: (m: string) => Promise<string>
}> = {}) {
  const store = new VerdictStore(path.join(tmp, 'v.json'))
  const lookupPrUrl = vi.fn(async (_worktreePath: string) => opts.lookupPrUrl ?? null)
  const recorder = new VerdictRecorder({
    store,
    getAiSettings: () => opts.aiSettings ?? { provider: 'none' },
    getDiffStats: vi.fn(async () => ({
      diffLines: opts.diffLines ?? { added: 0, removed: 0 },
      filesChanged: opts.filesChanged ?? 0,
    })),
    isBranchMerged: vi.fn(async () => opts.isBranchMerged ?? false),
    lookupPrUrl,
    summarize: opts.summarizer ?? (async (m) => `[middle omitted — ${m.length} chars]`),
    now: () => new Date('2026-05-16T00:00:00.000Z'),
  })
  return { store, recorder, lookupPrUrl }
}

describe('VerdictRecorder', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-rec-'))
  })
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('writes an unknown-outcome record on session creation', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 'short prompt', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    const rec = store.getBySessionId('s1')
    expect(rec).not.toBeNull()
    expect(rec!.outcome).toBe('unknown')
    expect(rec!.taskPrompt).toEqual({ kind: 'full', text: 'short prompt' })
    expect(rec!.metrics).toEqual({
      agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0,
    })
  })

  it('truncates prompts over 2KB into head/tail with summary middle', async () => {
    const longHead = 'H'.repeat(1024)
    const longMiddle = 'M'.repeat(500)
    const longTail = 'T'.repeat(1024)
    const long = longHead + longMiddle + longTail
    const { store, recorder } = makeRecorder(tmp, {
      summarizer: async () => 'summarized middle',
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: long, worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.taskPrompt.kind).toBe('truncated')
    if (rec.taskPrompt.kind === 'truncated') {
      expect(rec.taskPrompt.head.length).toBe(1024)
      expect(rec.taskPrompt.tail.length).toBe(1024)
      expect(rec.taskPrompt.middleSummary).toBe('summarized middle')
      expect(rec.taskPrompt.originalLength).toBe(long.length)
    }
  })

  it('finalizes outcome=merged when a branch with real work is merged', async () => {
    const { store, recorder } = makeRecorder(tmp, { isBranchMerged: true })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1') // the branch actually produced a commit
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('merged')
  })

  it('does not report merged for a no-activity branch (phantom ancestor)', async () => {
    // An empty branch (no commits of its own) is trivially an ancestor of its
    // base, so `isBranchMerged` returns true even though the session did nothing.
    // Such a session must not count as merged — it produced no work.
    const { store, recorder } = makeRecorder(tmp, { isBranchMerged: true })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('discarded')
  })

  it('finalizes outcome=discarded when no commits and not merged', async () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('discarded')
  })

  it('reconciles a PR opened after the last commit at termination', async () => {
    // The agent committed (so there is real work) but the PR was opened later,
    // outside any commit-triggered poll — only the terminal lookup catches it.
    const { store, recorder, lookupPrUrl } = makeRecorder(tmp, {
      lookupPrUrl: 'https://github.com/o/r/pull/55',
      filesChanged: 1,
      diffLines: { added: 4, removed: 0 },
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.prUrl).toBe('https://github.com/o/r/pull/55')
    expect(rec.outcome).toBe('pr_created')
    // The lookup must key on the worktree (resolves its CURRENT branch), not the
    // stored original branch — the gh-create-pr flow renames the branch.
    expect(lookupPrUrl).toHaveBeenCalledWith('/tmp/wt')
  })

  it('keeps merged outcome but still records a PR found at termination', async () => {
    const { store, recorder } = makeRecorder(tmp, {
      isBranchMerged: true,
      lookupPrUrl: 'https://github.com/o/r/pull/77',
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.outcome).toBe('merged')
    expect(rec.metrics.prUrl).toBe('https://github.com/o/r/pull/77')
  })

  it('snapshots diff stats and durationMs on termination', async () => {
    const { store, recorder } = makeRecorder(tmp, {
      diffLines: { added: 12, removed: 3 }, filesChanged: 2,
    })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.diffLines).toEqual({ added: 12, removed: 3 })
    expect(rec.metrics.filesChanged).toBe(2)
    expect(rec.terminatedAt).toBeDefined()
    expect(rec.durationMs).toBeDefined()
  })

  it('ignores onSessionTerminated for unknown sessionId', async () => {
    const { recorder } = makeRecorder(tmp)
    await expect(recorder.onSessionTerminated('nope')).resolves.not.toThrow()
  })

  it('drops the active entry when the store row is already gone on termination', async () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    // Simulate the store record being removed out from under a tracked session.
    vi.spyOn(store, 'getBySessionId').mockReturnValue(null)
    await recorder.onSessionTerminated('s1')
    const active = (recorder as unknown as { active: Map<string, unknown> }).active
    expect(active.has('s1')).toBe(false)
  })
})

describe('VerdictRecorder per-event hooks', () => {
  let tmp: string

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-rec-h-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('increments humanEdits only when status is not running', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onStatus('s1', 'running')
    recorder.onFilesChanged('s1')        // ignored — agent is running
    recorder.onStatus('s1', 'waiting')
    recorder.onFilesChanged('s1')        // counted
    recorder.onFilesChanged('s1')        // counted
    expect(store.getBySessionId('s1')!.metrics.humanEdits).toBe(2)
  })

  it('increments agentCommits and sets outcome=committed_only', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.agentCommits).toBe(1)
    expect(rec.outcome).toBe('committed_only')
  })

  it('onPrCreated sets outcome=pr_created and stores prUrl', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onPrCreated('s1', 'https://github.com/o/r/pull/9')
    const rec = store.getBySessionId('s1')!
    expect(rec.outcome).toBe('pr_created')
    expect(rec.metrics.prUrl).toBe('https://github.com/o/r/pull/9')
  })

  it('finalize keeps pr_created outcome when branch not merged', async () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onPrCreated('s1', 'https://example/1')
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('pr_created')
  })

  it('hooks for unknown sessionId are silently ignored', () => {
    const { recorder } = makeRecorder(tmp)
    expect(() => recorder.onStatus('nope', 'running')).not.toThrow()
    expect(() => recorder.onFilesChanged('nope')).not.toThrow()
    expect(() => recorder.onAgentCommit('nope')).not.toThrow()
    expect(() => recorder.onPrCreated('nope', 'u')).not.toThrow()
  })

  it('onSessionCreated preserves existing metrics when called again for the same session (re-adoption after restart)', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 'original', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')
    recorder.onPrCreated('s1', 'https://example/1')
    const before = store.getBySessionId('s1')!

    // Simulate re-adoption: SessionDiscovery sees the worktree on next launch
    // and re-registers the same sessionId. Metrics + createdAt + prUrl must survive.
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 'NEW PROMPT', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    const after = store.getBySessionId('s1')!
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.metrics.agentCommits).toBe(1)
    expect(after.metrics.prUrl).toBe('https://example/1')
    expect(after.outcome).toBe('pr_created')
    expect(after.taskPrompt).toEqual(before.taskPrompt)
  })

  it('events flow again after re-adoption of a re-registered session', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')

    // Re-register (simulates app restart + SessionDiscovery).
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })

    // After re-registration, edits & PR events should be honored again.
    recorder.onStatus('s1', 'waiting')
    recorder.onFilesChanged('s1')
    recorder.onPrCreated('s1', 'https://example/2')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.humanEdits).toBe(1)
    expect(rec.metrics.prUrl).toBe('https://example/2')
    expect(rec.outcome).toBe('pr_created')
  })
})
