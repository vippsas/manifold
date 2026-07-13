import { describe, it, expect } from 'vitest'
import * as os from 'node:os'
import { createEvalRunner } from './eval-runner'

describe('createEvalRunner', () => {
  const runner = createEvalRunner()

  it('captures stdout and exit code 0', async () => {
    const r = await runner.run(os.tmpdir(), 'echo hello', 10, new AbortController().signal)
    expect(r.stdout).toContain('hello')
    expect(r.exitCode).toBe(0)
    expect(r.timedOut).toBe(false)
  })

  it('reports a nonzero exit code', async () => {
    const r = await runner.run(os.tmpdir(), 'exit 3', 10, new AbortController().signal)
    expect(r.exitCode).toBe(3)
    expect(r.timedOut).toBe(false)
  })

  it('times out a long command and flags timedOut', async () => {
    const r = await runner.run(os.tmpdir(), 'sleep 5', 1, new AbortController().signal)
    expect(r.timedOut).toBe(true)
  })

  it('escalates an aborted command that ignores SIGTERM', async () => {
    if (process.platform === 'win32') return
    const controller = new AbortController()
    const startedAt = Date.now()
    const running = runner.run(os.tmpdir(), "trap '' TERM; sleep 10", 20, controller.signal)

    setTimeout(() => controller.abort(), 50)
    await running

    expect(Date.now() - startedAt).toBeLessThan(4_000)
  }, 5_000)

  it('appends stderr under a marker', async () => {
    const r = await runner.run(os.tmpdir(), 'echo oops 1>&2', 10, new AbortController().signal)
    expect(r.stdout).toContain('---stderr---')
    expect(r.stdout).toContain('oops')
  })
})
