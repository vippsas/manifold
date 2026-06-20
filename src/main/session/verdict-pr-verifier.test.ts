import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { VerdictStore } from '../store/verdict-store'
import { verifyVerdictPullRequests } from './verdict-pr-verifier'
import type { VerdictRecord } from '../../shared/verdict-types'

function record(overrides: Partial<VerdictRecord> = {}): VerdictRecord {
  return {
    sessionId: 's1',
    projectId: 'p1',
    branch: 'manifold/foo',
    runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' },
    outcome: 'pr_created',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: {
      agentCommits: 1,
      humanEdits: 0,
      diffLines: { added: 1, removed: 0 },
      filesChanged: 1,
      prUrl: 'https://github.com/o/r/pull/1',
    },
    ...overrides,
  }
}

describe('verifyVerdictPullRequests', () => {
  let tmp: string

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-prs-'))
  })

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('marks a captured PR session as merged when GitHub reports it merged', async () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'merged' }))

    const result = await verifyVerdictPullRequests({
      store,
      lookupStatus: vi.fn(async () => ({ state: 'merged', mergedAt: '2026-06-01T12:00:00Z' })),
      now: () => new Date('2026-06-20T10:00:00Z'),
    })

    const rec = store.getBySessionId('merged')!
    expect(result).toEqual({ eligible: 1, checked: 1, updated: 1, failed: 0 })
    expect(rec.outcome).toBe('merged')
    expect(rec.metrics.prState).toBe('merged')
    expect(rec.metrics.prCheckedAt).toBe('2026-06-20T10:00:00.000Z')
    expect(rec.metrics.prMergedAt).toBe('2026-06-01T12:00:00Z')
  })

  it('keeps an open PR in the PR bucket while recording the check time', async () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'open' }))

    const result = await verifyVerdictPullRequests({
      store,
      lookupStatus: vi.fn(async () => ({ state: 'open', mergedAt: null })),
      now: () => new Date('2026-06-20T10:00:00Z'),
    })

    const rec = store.getBySessionId('open')!
    expect(result).toEqual({ eligible: 1, checked: 1, updated: 0, failed: 0 })
    expect(rec.outcome).toBe('pr_created')
    expect(rec.metrics.prState).toBe('open')
    expect(rec.metrics.prCheckedAt).toBe('2026-06-20T10:00:00.000Z')
    expect(rec.metrics.prCheckError).toBeUndefined()
  })

  it('records per-row verification failures without changing the verdict', async () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'failed' }))

    const result = await verifyVerdictPullRequests({
      store,
      lookupStatus: vi.fn(async () => { throw new Error('gh auth failed') }),
      now: () => new Date('2026-06-20T10:00:00Z'),
    })

    const rec = store.getBySessionId('failed')!
    expect(result).toEqual({ eligible: 1, checked: 1, updated: 0, failed: 1 })
    expect(rec.outcome).toBe('pr_created')
    expect(rec.metrics.prCheckedAt).toBe('2026-06-20T10:00:00.000Z')
    expect(rec.metrics.prCheckError).toBe('gh auth failed')
  })

  it('only verifies pr_created verdicts with a captured PR URL', async () => {
    const store = new VerdictStore(path.join(tmp, 'v.json'))
    store.upsert(record({ sessionId: 'eligible' }))
    store.upsert(record({ sessionId: 'no-url', metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 1, removed: 0 }, filesChanged: 1 } }))
    store.upsert(record({ sessionId: 'already-merged', outcome: 'merged' }))
    const lookupStatus = vi.fn(async () => ({ state: 'open' as const, mergedAt: null }))

    const result = await verifyVerdictPullRequests({ store, lookupStatus })

    expect(result.eligible).toBe(1)
    expect(lookupStatus).toHaveBeenCalledOnce()
    expect(lookupStatus).toHaveBeenCalledWith('https://github.com/o/r/pull/1')
  })
})
