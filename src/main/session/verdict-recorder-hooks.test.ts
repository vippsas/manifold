import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder, type VerdictRecorderDeps } from './verdict-recorder'

function makeRecorder(tmp: string, opts: Partial<{
  isBranchMerged: boolean
  resolveSessionUsage: VerdictRecorderDeps['resolveSessionUsage']
}> = {}) {
  const store = new VerdictStore(path.join(tmp, 'v.json'))
  const recorder = new VerdictRecorder({
    store,
    getAiSettings: () => ({ provider: 'none' }),
    getDiffStats: vi.fn(async () => ({ diffLines: { added: 0, removed: 0 }, filesChanged: 0 })),
    isBranchMerged: vi.fn(async () => opts.isBranchMerged ?? false),
    lookupPrUrl: vi.fn(async () => null),
    summarize: async (m) => m,
    resolveSessionUsage: opts.resolveSessionUsage,
    now: () => new Date('2026-05-16T00:00:00.000Z'),
  })
  return { store, recorder }
}

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
    recorder.onFilesChanged('s1')
    recorder.onStatus('s1', 'waiting')
    recorder.onFilesChanged('s1')
    recorder.onFilesChanged('s1')
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

  it('onSessionCreated preserves existing metrics when called again for the same session', () => {
    const { store, recorder } = makeRecorder(tmp)
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 'original', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    recorder.onAgentCommit('s1')
    recorder.onPrCreated('s1', 'https://example/1')
    const before = store.getBySessionId('s1')!

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
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })

    recorder.onStatus('s1', 'waiting')
    recorder.onFilesChanged('s1')
    recorder.onPrCreated('s1', 'https://example/2')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.humanEdits).toBe(1)
    expect(rec.metrics.prUrl).toBe('https://example/2')
    expect(rec.outcome).toBe('pr_created')
  })

  it('writes tokenUsage + turns from resolveSessionUsage at termination', async () => {
    const resolveSessionUsage = vi.fn(async () => ({
      tokenUsage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 },
      turns: 4,
    }))
    const { store, recorder } = makeRecorder(tmp, { resolveSessionUsage })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(resolveSessionUsage).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 's1',
      worktreePath: '/tmp/wt',
      runtime: 'claude',
      createdAtMs: Date.parse('2026-05-16T00:00:00.000Z'),
      terminatedAtMs: Date.parse('2026-05-16T00:00:00.000Z'),
    }))
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 200, cacheReadTokens: 50, cacheCreationTokens: 10 })
    expect(rec.metrics.turns).toBe(4)
  })

  it('leaves tokenUsage/turns undefined when the resolver returns null', async () => {
    const { store, recorder } = makeRecorder(tmp, { resolveSessionUsage: async () => null })
    recorder.onSessionCreated({
      sessionId: 's2', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'codex', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s2')
    const rec = store.getBySessionId('s2')!
    expect(rec.metrics.tokenUsage).toBeUndefined()
    expect(rec.metrics.turns).toBeUndefined()
  })
})
