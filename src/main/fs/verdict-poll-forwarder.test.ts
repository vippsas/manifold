import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { VerdictStore } from '../store/verdict-store'
import { VerdictRecorder } from '../session/verdict-recorder'
import { VerdictPollForwarder } from './verdict-poll-forwarder'

function makeRecorder(tmp: string) {
  const store = new VerdictStore(path.join(tmp, 'v.json'))
  const recorder = new VerdictRecorder({
    store,
    getAiSettings: () => ({ provider: 'none' }),
    getDiffStats: async () => ({ diffLines: { added: 0, removed: 0 }, filesChanged: 0 }),
    isBranchMerged: async () => false,
    summarize: async (m) => `[middle omitted — ${m.length} chars]`,
    now: () => new Date('2026-05-17T00:00:00.000Z'),
  })
  return { store, recorder }
}

function register(recorder: VerdictRecorder, sessionId: string): void {
  recorder.onSessionCreated({
    sessionId,
    projectId: 'p1',
    branch: 'manifold/oslo',
    runtime: 'claude',
    taskPrompt: 't',
    worktreePath: '/tmp/wt',
    baseBranch: 'main',
  })
}

describe('VerdictPollForwarder', () => {
  let tmp: string

  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forwarder-')) })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('fires onAgentCommit when HEAD sha changes between ticks', async () => {
    const { store, recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    let head = 'sha-a'
    const fwd = new VerdictPollForwarder(async () => head, async () => 'manifold/oslo', async () => null)
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1')   // baseline
    head = 'sha-b'
    await fwd.notifyGitChange('/tmp/wt', 's1')   // new commit
    expect(store.getBySessionId('s1')!.metrics.agentCommits).toBe(1)
  })

  it('detects a shell-created PR on first observation and records its URL', async () => {
    const { store, recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    const prLookup = vi.fn(async () => 'https://github.com/o/r/pull/42')
    const fwd = new VerdictPollForwarder(async () => 'sha-a', async () => 'manifold/oslo', prLookup)
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1')

    expect(prLookup).toHaveBeenCalledWith('/tmp/wt', 'manifold/oslo')
    const rec = store.getBySessionId('s1')!
    expect(rec.metrics.prUrl).toBe('https://github.com/o/r/pull/42')
    expect(rec.outcome).toBe('pr_created')
  })

  it('detects a PR after a new commit (typical gh pr create flow)', async () => {
    const { store, recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    let head = 'sha-a'
    let prUrl: string | null = null
    const fwd = new VerdictPollForwarder(
      async () => head,
      async () => 'manifold/oslo',
      async () => prUrl,
    )
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1') // baseline, no PR yet
    expect(store.getBySessionId('s1')!.metrics.prUrl).toBeUndefined()

    head = 'sha-b'
    prUrl = 'https://github.com/o/r/pull/7'
    await fwd.notifyGitChange('/tmp/wt', 's1') // commit + PR appears

    expect(store.getBySessionId('s1')!.metrics.prUrl).toBe('https://github.com/o/r/pull/7')
  })

  it('skips the PR lookup once a PR is already recorded', async () => {
    const { recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    recorder.onPrCreated('s1', 'https://github.com/o/r/pull/9')
    let head = 'sha-a'
    const prLookup = vi.fn(async () => 'https://github.com/o/r/pull/different')
    const fwd = new VerdictPollForwarder(async () => head, async () => 'manifold/oslo', prLookup)
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1') // baseline observation -> shouldPollPr=true, but skipped
    head = 'sha-b'
    await fwd.notifyGitChange('/tmp/wt', 's1') // HEAD changed -> shouldPollPr=true, still skipped
    expect(prLookup).not.toHaveBeenCalled()
  })

  it('does not poll for a PR when HEAD has not changed', async () => {
    const { recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    const prLookup = vi.fn(async () => null)
    const fwd = new VerdictPollForwarder(async () => 'sha-a', async () => 'manifold/oslo', prLookup)
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1') // first observation
    await fwd.notifyGitChange('/tmp/wt', 's1') // same HEAD
    await fwd.notifyGitChange('/tmp/wt', 's1') // same HEAD
    expect(prLookup).toHaveBeenCalledTimes(1)
  })

  it('swallows gh lookup errors without affecting commit/edit signaling', async () => {
    const { store, recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    let head = 'sha-a'
    const fwd = new VerdictPollForwarder(
      async () => head,
      async () => 'manifold/oslo',
      async () => { throw new Error('gh not installed') },
    )
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1')
    head = 'sha-b'
    await expect(fwd.notifyGitChange('/tmp/wt', 's1')).resolves.not.toThrow()
    expect(store.getBySessionId('s1')!.metrics.agentCommits).toBe(1)
    expect(store.getBySessionId('s1')!.metrics.prUrl).toBeUndefined()
  })

  it('ignores a detached-HEAD branch result', async () => {
    const { recorder } = makeRecorder(tmp)
    register(recorder, 's1')
    const prLookup = vi.fn(async () => 'https://example/1')
    const fwd = new VerdictPollForwarder(async () => 'sha-a', async () => 'HEAD', prLookup)
    fwd.setRecorder(recorder)

    await fwd.notifyGitChange('/tmp/wt', 's1')
    expect(prLookup).not.toHaveBeenCalled()
  })
})
