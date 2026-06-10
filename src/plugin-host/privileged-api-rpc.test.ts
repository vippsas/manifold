import { describe, it, expect } from 'vitest'
import { RpcEndpoint, HOST_AGENTS, HOST_LM, type RpcMessage } from '../shared/plugins/rpc'
import { WorkspaceContext } from './workspace-api'
import { createAgentsApi } from './agents-api'
import { createLmApi } from './lm-api'

function wirePair(): { host: RpcEndpoint; main: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  host = new RpcEndpoint({ post: (m: RpcMessage) => void main.handleMessage(m) })
  main = new RpcEndpoint({ post: (m: RpcMessage) => void host.handleMessage(m) })
  return { host, main }
}

describe('agents-api over RPC', () => {
  it('activeAgent is undefined with no active session', () => {
    const { host } = wirePair()
    const ws = new WorkspaceContext()
    const agents = createAgentsApi(host, ws, 'p.x')
    expect(agents.activeAgent).toBeUndefined()
  })

  it('runTurn forwards to HOST_AGENTS.$runTurn (with the plugin id) and returns its outcome', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_AGENTS, {
      $runTurn: (pid: string, sid: string, prompt: string, opts: unknown) => { calls.push([pid, sid, prompt, opts]); return 'ended' },
      $cancelTurn: () => undefined,
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const agents = createAgentsApi(host, ws, 'p.builtin')
    const outcome = await agents.activeAgent!.runTurn('PROMPT', { budgetSeconds: 30 })
    expect(outcome).toBe('ended')
    expect(calls).toEqual([['p.builtin', 's1', 'PROMPT', { budgetSeconds: 30 }]])
  })

  it('getAgent(sessionId).runTurn forwards to the requested session instead of the active one', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_AGENTS, {
      $runTurn: (pid: string, sid: string, prompt: string, opts: unknown) => { calls.push([pid, sid, prompt, opts]); return 'ended' },
      $cancelTurn: () => undefined,
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 'active-session', status: 'running', worktreePath: '/wt-active' } })
    const agents = createAgentsApi(host, ws, 'p.builtin')
    const outcome = await agents.getAgent('pinned-session')!.runTurn('PROMPT', { budgetSeconds: 30 })
    expect(outcome).toBe('ended')
    expect(calls).toEqual([['p.builtin', 'pinned-session', 'PROMPT', { budgetSeconds: 30 }]])
  })

  it('a cancellation token triggers $cancelTurn (with the plugin id)', async () => {
    const { host, main } = wirePair()
    let cancelled: [string, string] | undefined
    main.registerService(HOST_AGENTS, {
      $runTurn: () => new Promise(() => {/* never resolves */}),
      $cancelTurn: (pid: string, sid: string) => { cancelled = [pid, sid] },
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const agents = createAgentsApi(host, ws, 'p.builtin')
    const listeners: (() => void)[] = []
    const token = { isCancellationRequested: false, onCancellationRequested: (l: () => void) => { listeners.push(l); return { dispose() {} } } }
    void agents.activeAgent!.runTurn('PROMPT', undefined, token)
    listeners.forEach((l) => l())
    await new Promise((r) => setTimeout(r, 0))
    expect(cancelled).toEqual(['p.builtin', 's1'])
  })
})

describe('lm-api over RPC', () => {
  it('selectChatModels maps host models and sendRequest forwards (with the plugin id)', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_LM, {
      $selectChatModels: (pid: string, sid: string | undefined) => { calls.push(['select', pid, sid]); return [{ id: 'm1' }] },
      $sendRequest: (pid: string, sid: string | undefined, prompt: string, opts: unknown) => { calls.push(['send', pid, sid, prompt, opts]); return { text: 'OK' } },
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 's1', status: 'running', worktreePath: '/wt' } })
    const lm = createLmApi(host, ws, 'p.builtin')
    const models = await lm.selectChatModels()
    expect(models.map((m) => m.id)).toEqual(['m1'])
    const res = await models[0].sendRequest('PROMPT', { timeoutMs: 1000 })
    expect(res.text).toBe('OK')
    expect(calls).toEqual([['select', 'p.builtin', 's1'], ['send', 'p.builtin', 's1', 'PROMPT', { timeoutMs: 1000 }]])
  })

  it('selectChatModels(sessionId) targets the requested session instead of the active one', async () => {
    const { host, main } = wirePair()
    const calls: unknown[][] = []
    main.registerService(HOST_LM, {
      $selectChatModels: (pid: string, sid: string | undefined) => { calls.push(['select', pid, sid]); return [{ id: 'm1' }] },
      $sendRequest: (pid: string, sid: string | undefined, prompt: string, opts: unknown) => { calls.push(['send', pid, sid, prompt, opts]); return { text: 'OK' } },
    })
    const ws = new WorkspaceContext()
    ws.setActiveContext({ session: { id: 'active-session', status: 'running', worktreePath: '/wt-active' } })
    const lm = createLmApi(host, ws, 'p.builtin')
    const models = await lm.selectChatModels('pinned-session')
    await models[0].sendRequest('PROMPT', { timeoutMs: 1000 })
    expect(calls).toEqual([['select', 'p.builtin', 'pinned-session'], ['send', 'p.builtin', 'pinned-session', 'PROMPT', { timeoutMs: 1000 }]])
  })
})
