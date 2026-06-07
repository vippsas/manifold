import { describe, it, expect } from 'vitest'
import { createAgentControlService, createTurnEndWaiter } from './agent-control-service'

interface FakeInternal { status: string; lastOutputTime?: number; lastTurnCompletedTime?: number; nonInteractive?: boolean; ptyId?: string }

function fakeSessionManager(opts: {
  worktreePath?: string | null
  internal?: () => FakeInternal | undefined
  onInput?: (text: string) => void
}): { inputs: string[]; getSession: (id: string) => unknown; getInternalSession: (id: string) => FakeInternal | undefined; sendInput: (id: string, text: string) => void } {
  const inputs: string[] = []
  return {
    inputs,
    getSession: (_id: string) => (opts.worktreePath === null ? undefined : { worktreePath: opts.worktreePath ?? '/wt' }),
    getInternalSession: (_id: string) => (opts.internal ? opts.internal() : { status: 'running' }),
    sendInput: (_id: string, text: string) => { inputs.push(text); opts.onInput?.(text) },
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

  it("returns 'ended' when a non-interactive agent PTY exits even if session status stays running", async () => {
    let t = 0
    let ptyId = 'pty-turn'
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => {
      t += ms
      if (t >= 100) ptyId = ''
    }
    const sm = fakeSessionManager({ internal: () => ({ status: 'running', lastOutputTime: 0, nonInteractive: true, ptyId }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal, { agentPtyId: 'pty-turn' })
    expect(outcome).toBe('ended')
  })

  it("returns 'ended' when a structured turn-complete event is seen while status stays running", async () => {
    let t = 0
    let lastOutputTime = 0
    let lastTurnCompletedTime = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => {
      t += ms
      if (t >= 100 && lastTurnCompletedTime === 0) {
        lastOutputTime = t
        lastTurnCompletedTime = t
      }
    }
    const sm = fakeSessionManager({ internal: () => ({ status: 'running', lastOutputTime, lastTurnCompletedTime }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal)
    expect(outcome).toBe('ended')
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

  it('passes the spawned non-interactive agent PTY id to the waiter', async () => {
    const internal: FakeInternal = { status: 'running', nonInteractive: true, ptyId: '' }
    const sm = fakeSessionManager({
      internal: () => internal,
      onInput: (text) => {
        if (text === 'PROMPT') internal.ptyId = 'pty-turn'
      },
    })
    const seenContexts: unknown[] = []
    const svc = createAgentControlService(sm as never, {
      sleep: instant,
      waitForTurnEnd: async (_sid, _budget, _signal, context) => {
        seenContexts.push(context)
        return 'ended'
      },
    })

    await svc.runTurn('s1', 'PROMPT')

    expect(seenContexts).toEqual([expect.objectContaining({ agentPtyId: 'pty-turn', turnStartedAt: expect.any(Number) })])
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
