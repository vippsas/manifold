import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { appendIteration, readAllIterations, iterationLogPath } from './loop-iteration-log'
import type { LoopIteration } from '../../shared/loop-types'

let tmpWorktree: string

beforeEach(async () => {
  tmpWorktree = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-iter-log-'))
})

afterEach(async () => {
  await fs.rm(tmpWorktree, { recursive: true, force: true })
})

function sample(overrides: Partial<LoopIteration> = {}): LoopIteration {
  return {
    index: 1,
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_001_000,
    score: 42,
    outcome: 'improved',
    ...overrides,
  }
}

describe('iterationLogPath', () => {
  it('returns <worktree>/.manifold/loop.jsonl', () => {
    expect(iterationLogPath('/my/wt')).toBe('/my/wt/.manifold/loop.jsonl')
  })
})

describe('readAllIterations', () => {
  it('returns empty array when no log file exists', async () => {
    expect(await readAllIterations(tmpWorktree)).toEqual([])
  })
})

describe('appendIteration + readAllIterations', () => {
  it('creates .manifold directory on first append', async () => {
    await appendIteration(tmpWorktree, sample())
    const stat = await fs.stat(path.join(tmpWorktree, '.manifold'))
    expect(stat.isDirectory()).toBe(true)
  })

  it('round-trips a single iteration', async () => {
    const iter = sample()
    await appendIteration(tmpWorktree, iter)
    expect(await readAllIterations(tmpWorktree)).toEqual([iter])
  })

  it('appends multiple iterations preserving order', async () => {
    const iters = [
      sample({ index: 1, score: 10, outcome: 'improved' }),
      sample({ index: 2, score: 12, outcome: 'regressed' }),
      sample({ index: 3, outcome: 'failed', score: undefined, errorMessage: 'eval failed' }),
    ]
    for (const it of iters) await appendIteration(tmpWorktree, it)
    expect(await readAllIterations(tmpWorktree)).toEqual(iters)
  })

  it('skips malformed lines when reading', async () => {
    const iter = sample()
    await appendIteration(tmpWorktree, iter)
    await fs.appendFile(path.join(tmpWorktree, '.manifold', 'loop.jsonl'), '{not json\n')
    expect(await readAllIterations(tmpWorktree)).toEqual([iter])
  })
})
