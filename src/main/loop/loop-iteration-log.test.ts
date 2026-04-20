import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { appendIteration, readAllIterations, iterationLogPath } from './loop-iteration-log'
import type { LoopIteration } from '../../shared/loop-types'

let tmpHome: string
let tmpWorktree: string
let prevHome: string | undefined
let prevUserProfile: string | undefined

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-iter-log-home-'))
  tmpWorktree = await fs.mkdtemp(path.join(os.tmpdir(), 'loop-iter-log-wt-'))
  prevHome = process.env.HOME
  prevUserProfile = process.env.USERPROFILE
  process.env.HOME = tmpHome
  process.env.USERPROFILE = tmpHome
})

afterEach(async () => {
  if (prevHome === undefined) delete process.env.HOME
  else process.env.HOME = prevHome
  if (prevUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = prevUserProfile
  await fs.rm(tmpHome, { recursive: true, force: true })
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
  it('stores logs under the user home, not inside the worktree', () => {
    const logPath = iterationLogPath('/my/wt')
    expect(logPath.startsWith(path.join(tmpHome, '.manifold', 'loop-logs'))).toBe(true)
    expect(logPath.includes('/my/wt/')).toBe(false)
    expect(logPath.endsWith('.jsonl')).toBe(true)
  })

  it('produces a stable path for the same worktree and a different path for a different worktree', () => {
    expect(iterationLogPath('/my/wt')).toBe(iterationLogPath('/my/wt'))
    expect(iterationLogPath('/my/wt')).not.toBe(iterationLogPath('/other/wt'))
  })
})

describe('readAllIterations', () => {
  it('returns empty array when no log file exists', async () => {
    expect(await readAllIterations(tmpWorktree)).toEqual([])
  })
})

describe('appendIteration + readAllIterations', () => {
  it('does not create a .manifold directory inside the worktree', async () => {
    await appendIteration(tmpWorktree, sample())
    await expect(fs.stat(path.join(tmpWorktree, '.manifold'))).rejects.toMatchObject({ code: 'ENOENT' })
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
    await fs.appendFile(iterationLogPath(tmpWorktree), '{not json\n')
    expect(await readAllIterations(tmpWorktree)).toEqual([iter])
  })
})
