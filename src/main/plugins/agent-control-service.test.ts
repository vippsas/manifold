import { describe, it, expect } from 'vitest'
import { createAgentControlService, createTurnEndWaiter } from './agent-control-service'

interface FakeInternal { status: string; lastOutputTime?: number }

function fakeSessionManager(opts: {
  worktreePath?: string | null
  internal?: () => FakeInternal | undefined
}): { inputs: string[]; getSession: (id: string) => unknown; getInternalSession: (id: string) => FakeInternal | undefined; sendInput: (id: string, text: string) => void } {
  const inputs: string[] = []
  return {
    inputs,
    getSession: (_id: string) => (opts.worktreePath === null ? undefined : { worktreePath: opts.worktreePath ?? '/wt' }),
    getInternalSession: (_id: string) => (opts.internal ? opts.internal() : { status: 'running' }),
    sendInput: (_id: string, text: string) => { inputs.push(text) },
  }
}

describe('createTurnEndWaiter', () => {
  it("returns 'ended' once idle + output-silence grace elapses", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    // produces output at t=10, then goes idle and silent
    const sm = fakeSessionManager({ internal: () => ({ status: 'waiting', lastOutputTime: 10 }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal)
    expect(outcome).toBe('ended')
  })

  it("returns 'timeout' when the budget elapses without ending", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const sm = fakeSessionManager({ internal: () => ({ status: 'running', lastOutputTime: t }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 1, new AbortController().signal)
    expect(outcome).toBe('timeout')
  })

  it("returns 'aborted' when the signal is already aborted", async () => {
    const sm = fakeSessionManager({})
    const wait = createTurnEndWaiter(sm as never, {})
    const ac = new AbortController()
    ac.abort()
    expect(await wait('s1', 60, ac.signal)).toBe('aborted')
  })
})

describe('createAgentControlService', () => {
  const instant = async (): Promise<void> => {}

  it('throws when the session has no worktree', async () => {
    const sm = fakeSessionManager({ worktreePath: null })
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended', sleep: instant })
    await expect(svc.runTurn('s1', 'do it')).rejects.toThrow(/no worktree/i)
  })

  it('sends the prompt then a carriage return and returns the wait outcome', async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended', sleep: instant })
    const outcome = await svc.runTurn('s1', 'PROMPT')
    expect(outcome).toBe('ended')
    expect(sm.inputs).toEqual(['PROMPT', '\r'])
  })

  it('clears context first when clearContext is set', async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, { waitForTurnEnd: async () => 'ended', sleep: instant })
    await svc.runTurn('s1', 'PROMPT', { clearContext: true })
    expect(sm.inputs).toEqual(['/clear', '\r', 'PROMPT', '\r'])
  })

  it("cancelTurn aborts an in-flight turn and resolves 'aborted'", async () => {
    const sm = fakeSessionManager({})
    const svc = createAgentControlService(sm as never, {
      sleep: instant,
      waitForTurnEnd: (_sid, _budget, signal) =>
        new Promise((resolve) => {
          if (signal.aborted) return resolve('aborted')
          signal.addEventListener('abort', () => resolve('aborted'), { once: true })
        }),
    })
    const p = svc.runTurn('s1', 'PROMPT')
    svc.cancelTurn('s1')
    expect(await p).toBe('aborted')
  })
})
