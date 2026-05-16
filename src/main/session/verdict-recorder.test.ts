import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from './verdict-recorder'
import type { AiServiceSettings } from '../../shared/watch-types'

function makeRecorder(tmp: string, opts: Partial<{
  diffLines: { added: number; removed: number }
  filesChanged: number
  isBranchMerged: boolean
  aiSettings: AiServiceSettings
  summarizer: (m: string) => Promise<string>
}> = {}) {
  const store = new VerdictStore(path.join(tmp, 'v.json'))
  const recorder = new VerdictRecorder({
    store,
    getAiSettings: () => opts.aiSettings ?? { provider: 'none' },
    getDiffStats: vi.fn(async () => ({
      diffLines: opts.diffLines ?? { added: 0, removed: 0 },
      filesChanged: opts.filesChanged ?? 0,
    })),
    isBranchMerged: vi.fn(async () => opts.isBranchMerged ?? false),
    summarize: opts.summarizer ?? (async (m) => `[middle omitted — ${m.length} chars]`),
    now: () => new Date('2026-05-16T00:00:00.000Z'),
  })
  return { store, recorder }
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

  it('finalizes outcome=merged when the branch is merged', async () => {
    const { store, recorder } = makeRecorder(tmp, { isBranchMerged: true })
    recorder.onSessionCreated({
      sessionId: 's1', projectId: 'p1', branch: 'manifold/foo',
      runtime: 'claude', taskPrompt: 't', worktreePath: '/tmp/wt', baseBranch: 'main',
    })
    await recorder.onSessionTerminated('s1')
    expect(store.getBySessionId('s1')!.outcome).toBe('merged')
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
})
