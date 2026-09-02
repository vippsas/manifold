import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createViolaDoneSignal } from './done-signal'

const dirs: string[] = []

function worktree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'viola-done-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function write(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'DONE\n')
}

describe('createViolaDoneSignal', () => {
  it('resolves as soon as the worker writes the file it was told to write', async () => {
    const signal = createViolaDoneSignal({ pollMs: 5 })
    const wt = worktree()
    setTimeout(() => write(signal.donePath(wt)), 20)

    await expect(signal.wait(signal.donePath(wt), {
      signal: new AbortController().signal, timeoutMs: 2_000,
    })).resolves.toBe('done')
  })

  it('reports a timeout rather than claiming the worker finished', async () => {
    const signal = createViolaDoneSignal({ pollMs: 5 })

    await expect(signal.wait(signal.donePath(worktree()), {
      signal: new AbortController().signal, timeoutMs: 40,
    })).resolves.toBe('timeout')
  })

  it('stops waiting when Viola is stopped', async () => {
    const signal = createViolaDoneSignal({ pollMs: 5 })
    const abort = new AbortController()
    const pending = signal.wait(signal.donePath(worktree()), { signal: abort.signal, timeoutMs: 5_000 })
    abort.abort()

    await expect(pending).resolves.toBe('aborted')
  })

  it('ignores a signal left over from the previous turn', async () => {
    const signal = createViolaDoneSignal({ pollMs: 5 })
    const wt = worktree()
    write(signal.donePath(wt))

    await signal.clear(signal.donePath(wt))

    // The stale file is gone, so the next turn cannot inherit the last turn's completion.
    await expect(signal.wait(signal.donePath(wt), {
      signal: new AbortController().signal, timeoutMs: 40,
    })).resolves.toBe('timeout')
  })

  it('signals from inside the worker\'s own worktree', () => {
    const signal = createViolaDoneSignal()
    expect(signal.donePath('/wt/impl')).not.toBe(signal.donePath('/wt/review'))
    expect(signal.donePath('/wt/impl').startsWith('/wt/impl')).toBe(true)
  })
})
