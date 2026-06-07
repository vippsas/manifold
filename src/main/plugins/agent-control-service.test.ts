import { describe, it, expect } from 'vitest'
import { createAgentControlService, createTurnEndWaiter } from './agent-control-service'

interface FakeInternal {
  status: string
  runtimeId?: string
  outputBuffer?: string
  lastOutputTime?: number
  lastTurnCompletedTime?: number
  nonInteractive?: boolean
  ptyId?: string
}

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

  it("returns 'ended' once idle even when terminal repaint output continues", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const sm = fakeSessionManager({ internal: () => ({ status: 'waiting', lastOutputTime: t }) })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal)
    expect(outcome).toBe('ended')
  })

  it("returns 'ended' when the Codex output buffer grew into a final prompt even if output timestamps lag", async () => {
    let t = 1000
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const outputBuffer = [
      'Done. I made one small prose edit.',
      '› Find and fix a bug in @filename',
      'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
    ].join('\n')
    const sm = fakeSessionManager({
      internal: () => ({ status: 'waiting', runtimeId: 'codex', outputBuffer, lastOutputTime: 0 }),
    })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal, { turnStartedAt: 1000, outputLengthAtStart: 0 })
    expect(outcome).toBe('ended')
  })

  it("does not end a Codex turn from prompt echo alone", async () => {
    let t = 1000
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const outputBuffer = [
      '› Find and fix a bug in @filename',
      'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
    ].join('\n')
    const sm = fakeSessionManager({
      internal: () => ({ status: 'waiting', runtimeId: 'codex', outputBuffer, lastOutputTime: 0 }),
    })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 1, new AbortController().signal, { turnStartedAt: 1000, outputLengthAtStart: 0 })
    expect(outcome).toBe('timeout')
  })

  it("returns 'ended' when the output buffer shows a Codex prompt even if stored status is still running", async () => {
    let t = 0
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const outputBuffer = [
      '• Updated research/20260607-120639-boris-loops-codex-workflows/linkedin-article.md.',
      'One small change: tightened the close.',
      '› Write tests for @filename',
      'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
    ].join('\n')
    const sm = fakeSessionManager({
      internal: () => ({ status: 'running', runtimeId: 'codex', outputBuffer, lastOutputTime: t }),
    })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal)
    expect(outcome).toBe('ended')
  })

  it("returns 'ended' for a silent Codex prompt even when stale working text remains in the raw stream", async () => {
    let t = 1000
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const outputBuffer = [
      '• Done. Changed only research/20260607-120639-boris-loops-codex-workflows/linkedin-article.md.',
      'No tests or benchmarks run.',
      '› Implement {feature}',
      'gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund',
      '• Working (12s • esc to interrupt)',
    ].join('\n')
    const sm = fakeSessionManager({
      internal: () => ({ status: 'running', runtimeId: 'codex', outputBuffer, lastOutputTime: 1000 }),
    })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 60, new AbortController().signal, { turnStartedAt: 900, outputLengthAtStart: 0 })
    expect(outcome).toBe('ended')
  })

  it("does not end an active silent Codex prompt whose prompt line still says Working", async () => {
    let t = 1000
    const now = (): number => t
    const sleep = async (ms: number): Promise<void> => { t += ms }
    const outputBuffer = [
      'Prior completed output.',
      '› Implement {feature} gpt-5.5 xhigh · ~/.manifold/worktrees/Stories/ainews-alesund • Working (12s • esc to interrupt)',
    ].join('\n')
    const sm = fakeSessionManager({
      internal: () => ({ status: 'running', runtimeId: 'codex', outputBuffer, lastOutputTime: 1000 }),
    })
    const wait = createTurnEndWaiter(sm as never, { now, sleep, pollMs: 100, idleGraceMs: 500 })
    const outcome = await wait('s1', 1, new AbortController().signal, { turnStartedAt: 900, outputLengthAtStart: 0 })
    expect(outcome).toBe('timeout')
  })

  it("returns 'ended' for an exited Codex session even without a final prompt", async () => {
    const sm = fakeSessionManager({
      internal: () => ({ status: 'done', runtimeId: 'codex', outputBuffer: 'partial output without prompt', lastOutputTime: 0 }),
    })
    const wait = createTurnEndWaiter(sm as never, { now: () => 1000 })
    const outcome = await wait('s1', 60, new AbortController().signal, { turnStartedAt: 1000 })
    expect(outcome).toBe('ended')
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
    const internal: FakeInternal = { status: 'running', outputBuffer: 'previous output', nonInteractive: true, ptyId: '' }
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

    expect(seenContexts).toEqual([expect.objectContaining({ agentPtyId: 'pty-turn', turnStartedAt: expect.any(Number), outputLengthAtStart: 'previous output'.length })])
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
