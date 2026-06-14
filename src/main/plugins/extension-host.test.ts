import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivationTarget } from '../../plugin-host/activator'
import type { RpcMessage } from '../../shared/plugins/rpc'

interface FakeChild {
  posted: unknown[]
  postMessage: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  emit(event: string, ...args: unknown[]): void
}

interface HostForTest {
  activate(target: ActivationTarget): Promise<void>
  deactivate(id: string): Promise<void>
  deliverWebviewMessage(viewId: string, message: unknown): void
  setActiveContext(context: { project?: unknown; session?: unknown }): void
  notifyConfigChanged(pluginId: string): void
  executeContributedCommand(id: string, args: unknown[]): Promise<unknown>
  setEnabledResolver(fn: (pluginId: string) => boolean): void
  setOriginResolver(fn: (pluginId: string) => 'builtin' | 'user' | undefined): void
  setSend(fn: (channel: string, ...args: unknown[]) => void): void
  setTranscriptionResolver(fn: () => unknown): void
}

const mocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void
  type Child = {
    posted: unknown[]
    postMessage: ReturnType<typeof vi.fn>
    kill: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    emit(event: string, ...args: unknown[]): void
  }

  const children: Child[] = []
  const fork = vi.fn(() => {
    const handlers = new Map<string, Handler>()
    let child!: Child
    child = {
      posted: [],
      postMessage: vi.fn((message: unknown) => { child.posted.push(message) }),
      kill: vi.fn(),
      on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); return child }),
      emit(event: string, ...args: unknown[]) { handlers.get(event)?.(...args) },
    }
    children.push(child)
    return child
  })

  return {
    children,
    debugLog: vi.fn(),
    fork,
  }
})

vi.mock('electron', () => ({
  utilityProcess: {
    fork: mocks.fork,
  },
}))

vi.mock('../app/debug-log', () => ({
  debugLog: mocks.debugLog,
}))

function latestChild(): FakeChild {
  const child = mocks.children[mocks.children.length - 1]
  if (!child) throw new Error('expected utilityProcess.fork to create a child')
  return child
}

function firstRequest(child: FakeChild): Extract<RpcMessage, { t: 'req' }> {
  const message = child.posted[0] as RpcMessage | undefined
  if (!message || message.t !== 'req') throw new Error('expected a posted RPC request')
  return message
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function fakeAgentSpawn(): {
  spawnSibling: ReturnType<typeof vi.fn>
  sendText: ReturnType<typeof vi.fn>
  whenReady: ReturnType<typeof vi.fn>
  getStatus: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
} {
  return {
    spawnSibling: vi.fn(async () => ({ sessionId: 'sib-1' })),
    sendText: vi.fn(),
    whenReady: vi.fn(async () => true),
    getStatus: vi.fn(() => 'waiting'),
    kill: vi.fn(async () => undefined),
  }
}

async function createHost(
  agentControl: { runTurn: (...a: unknown[]) => unknown; cancelTurn: (...a: unknown[]) => unknown } = { runTurn: vi.fn(), cancelTurn: vi.fn() },
  lm: { selectChatModels: (...a: unknown[]) => unknown; sendRequest: (...a: unknown[]) => unknown } = { selectChatModels: vi.fn(), sendRequest: vi.fn() },
  agentSpawn: ReturnType<typeof fakeAgentSpawn> = fakeAgentSpawn(),
  now?: () => number,
  worktrees: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; pruneStale: ReturnType<typeof vi.fn>; listMergedOrphanBranches: ReturnType<typeof vi.fn>; deleteMergedBranch: ReturnType<typeof vi.fn> } = { list: vi.fn(), remove: vi.fn(), pruneStale: vi.fn(), listMergedOrphanBranches: vi.fn(), deleteMergedBranch: vi.fn() },
): Promise<HostForTest> {
  const { ExtensionHost } = await import('./extension-host')
  return new ExtensionHost(
    { get: vi.fn(), update: vi.fn() },
    agentControl as never,
    lm as never,
    agentSpawn as never,
    worktrees as never,
    now,
  ) as unknown as HostForTest
}

function lastReply(child: FakeChild): Extract<RpcMessage, { t: 'rep' }> | undefined {
  for (let i = child.posted.length - 1; i >= 0; i--) {
    const m = child.posted[i] as RpcMessage
    if (m.t === 'rep') return m
  }
  return undefined
}

describe('ExtensionHost shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.children.splice(0, mocks.children.length)
  })

  it('does not emit unhandled rejections when notification RPCs are rejected by host exit', async () => {
    const calls: Array<(host: HostForTest) => void> = [
      (host) => host.deliverWebviewMessage('view-1', { hello: true }),
      (host) => host.setActiveContext({ project: { id: 'project-1' } }),
      (host) => host.notifyConfigChanged('plugin.test'),
    ]
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason) }

    process.prependListener('unhandledRejection', onUnhandled)
    try {
      for (const call of calls) {
        const host = await createHost()
        call(host)
        latestChild().emit('exit', 0)
        await settle()
      }
    } finally {
      process.removeListener('unhandledRejection', onUnhandled)
    }

    expect(unhandled).toEqual([])
  })

  it('logs notification RPC failures that are not host shutdown', async () => {
    const host = await createHost()
    host.notifyConfigChanged('plugin.test')
    const child = latestChild()
    const request = firstRequest(child)

    child.emit('message', { t: 'rep', id: request.id, ok: false, error: 'no such method PluginConfig.$onDidChange' } satisfies RpcMessage)
    await settle()

    expect(mocks.debugLog).toHaveBeenCalledWith('[plugins] notifyConfigChanged failed: no such method PluginConfig.$onDidChange')
  })

  it('still rejects awaited activation RPCs when the host exits', async () => {
    const host = await createHost()
    const activation = host.activate({ id: 'plugin.test', root: '/tmp/plugin.test', main: 'index.js', kind: 'manifold' })

    latestChild().emit('exit', 1)

    await expect(activation).rejects.toThrow('plugin host exited (code 1)')
  })

  it('deactivate sends a $deactivate RPC for the plugin id', async () => {
    const host = await createHost()
    // Fork the child first (deactivate is a no-op before the host exists).
    void host.activate({ id: 'plugin.test', root: '/tmp/plugin.test', main: 'index.js', kind: 'manifold' })
    const child = latestChild()
    child.posted.length = 0
    void host.deactivate('plugin.test')
    const req = child.posted.find((m): m is Extract<RpcMessage, { t: 'req' }> => (m as RpcMessage).t === 'req' && (m as { method: string }).method === '$deactivate')
    expect(req?.args).toEqual(['plugin.test'])
  })

  it('deactivate is a no-op when the host has not been forked', async () => {
    const host = await createHost()
    await host.deactivate('plugin.test')
    expect(mocks.children.length).toBe(0)
  })

  it('refuses to execute a command owned by a disabled plugin', async () => {
    const host = await createHost()
    host.setEnabledResolver((id) => id !== 'plugin.disabled')
    // Register a command for the disabled plugin by simulating the host's HostCommands RPC.
    const { HOST_COMMANDS } = await import('../../shared/plugins/rpc')
    const child = (() => { void host.executeContributedCommand('noop', []).catch(() => {}); return latestChild() })()
    child.emit('message', { t: 'req', id: 9001, ctx: HOST_COMMANDS, method: '$registerCommand', args: ['plugin.disabled', 'cmd.x'] } satisfies RpcMessage)
    await settle()
    await expect(host.executeContributedCommand('cmd.x', [])).rejects.toThrow('disabled plugin')
  })

  it('still executes a command owned by an enabled plugin', async () => {
    const host = await createHost()
    host.setEnabledResolver(() => true)
    const { HOST_COMMANDS } = await import('../../shared/plugins/rpc')
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.emit('message', { t: 'req', id: 9002, ctx: HOST_COMMANDS, method: '$registerCommand', args: ['plugin.enabled', 'cmd.y'] } satisfies RpcMessage)
    await settle()
    // The command routes back to the host as a $invokeCommand RPC (no reply here) — it does
    // not reject synchronously with the disabled-plugin error, which is what we assert.
    const exec = host.executeContributedCommand('cmd.y', [])
    const invoke = child.posted.find((m): m is Extract<RpcMessage, { t: 'req' }> => (m as RpcMessage).t === 'req' && (m as { method: string }).method === '$invokeCommand')
    expect(invoke?.args).toEqual(['cmd.y', []])
    void exec.catch(() => {})
  })
})

describe('ExtensionHost privileged-capability trust boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.children.splice(0, mocks.children.length)
  })

  // The host-side gate runs in the same process as untrusted plugin code, so main must
  // re-check the caller. A raw HOST_AGENTS/HOST_LM RPC carrying a non-builtin (or unknown)
  // plugin id must be rejected here even though it never went through buildGatedApi.
  async function forkedHostWithOrigin(
    origin: (id: string) => 'builtin' | 'user' | undefined,
  ): Promise<{ child: FakeChild; runTurn: ReturnType<typeof vi.fn>; sendRequest: ReturnType<typeof vi.fn> }> {
    const runTurn = vi.fn(() => 'ended')
    const sendRequest = vi.fn(() => ({ text: 'OK' }))
    const host = await createHost({ runTurn, cancelTurn: vi.fn() }, { selectChatModels: vi.fn(() => [{ id: 'm1' }]), sendRequest })
    host.setOriginResolver(origin)
    // Fork the child by triggering any path that ensures the host.
    void host.executeContributedCommand('noop', []).catch(() => {})
    return { child: latestChild(), runTurn, sendRequest }
  }

  it('rejects $runTurn from a non-builtin plugin at the main boundary', async () => {
    const { HOST_AGENTS } = await import('../../shared/plugins/rpc')
    const { child, runTurn } = await forkedHostWithOrigin((id) => (id === 'p.builtin' ? 'builtin' : 'user'))
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 1, ctx: HOST_AGENTS, method: '$runTurn', args: ['p.user', 's1', 'PROMPT', undefined] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    expect(runTurn).not.toHaveBeenCalled()
  })

  it('rejects $sendRequest from an unknown plugin id at the main boundary', async () => {
    const { HOST_LM } = await import('../../shared/plugins/rpc')
    const { child, sendRequest } = await forkedHostWithOrigin(() => undefined)
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 2, ctx: HOST_LM, method: '$sendRequest', args: ['ghost', 's1', 'PROMPT', undefined] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    expect(sendRequest).not.toHaveBeenCalled()
  })

  it('allows $runTurn from a builtin plugin', async () => {
    const { HOST_AGENTS } = await import('../../shared/plugins/rpc')
    const { child, runTurn } = await forkedHostWithOrigin((id) => (id === 'p.builtin' ? 'builtin' : 'user'))
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 3, ctx: HOST_AGENTS, method: '$runTurn', args: ['p.builtin', 's1', 'PROMPT', undefined] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(true)
    expect((rep as { value: unknown }).value).toBe('ended')
    expect(runTurn).toHaveBeenCalledWith('s1', 'PROMPT', undefined)
  })

  it('allows $spawnSibling from a builtin plugin and delegates to the spawn service', async () => {
    const { HOST_AGENTS } = await import('../../shared/plugins/rpc')
    const agentSpawn = fakeAgentSpawn()
    const host = await createHost(undefined, undefined, agentSpawn)
    host.setOriginResolver((id) => (id === 'p.builtin' ? 'builtin' : 'user'))
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 4, ctx: HOST_AGENTS, method: '$spawnSibling', args: ['p.builtin', 'base-1', { title: 'T', groupId: 'g' }] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(true)
    expect((rep as { value: unknown }).value).toEqual({ sessionId: 'sib-1' })
    expect(agentSpawn.spawnSibling).toHaveBeenCalledWith('base-1', { title: 'T', groupId: 'g' })
  })

  it('rejects $spawnSibling from a non-builtin plugin at the main boundary', async () => {
    const { HOST_AGENTS } = await import('../../shared/plugins/rpc')
    const agentSpawn = fakeAgentSpawn()
    const host = await createHost(undefined, undefined, agentSpawn)
    host.setOriginResolver(() => 'user')
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 5, ctx: HOST_AGENTS, method: '$spawnSibling', args: ['p.user', 'base-1', undefined] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    expect(agentSpawn.spawnSibling).not.toHaveBeenCalled()
  })

  it('rejects $remove (workspace:manage) from a non-builtin plugin at the main boundary', async () => {
    const { HOST_WORKTREES } = await import('../../shared/plugins/rpc')
    const remove = vi.fn()
    const host = await createHost(undefined, undefined, undefined, undefined, { list: vi.fn(), remove, pruneStale: vi.fn(), listMergedOrphanBranches: vi.fn(), deleteMergedBranch: vi.fn() })
    host.setOriginResolver(() => 'user')
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 8, ctx: HOST_WORKTREES, method: '$remove', args: ['p.user', '/wt/x', { force: true }] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    // The load-bearing assertion: the destructive op was short-circuited, not merely error-wrapped.
    expect(remove).not.toHaveBeenCalled()
  })

  it('allows $remove from a builtin plugin and delegates to the worktree service', async () => {
    const { HOST_WORKTREES } = await import('../../shared/plugins/rpc')
    const remove = vi.fn(() => undefined)
    const host = await createHost(undefined, undefined, undefined, undefined, { list: vi.fn(), remove, pruneStale: vi.fn(), listMergedOrphanBranches: vi.fn(), deleteMergedBranch: vi.fn() })
    host.setOriginResolver((id) => (id === 'p.builtin' ? 'builtin' : 'user'))
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 9, ctx: HOST_WORKTREES, method: '$remove', args: ['p.builtin', '/wt/x', undefined] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(true)
    expect(remove).toHaveBeenCalledWith('/wt/x', undefined)
  })

  it('rejects $deleteMergedBranch from a non-builtin plugin at the main boundary', async () => {
    const { HOST_WORKTREES } = await import('../../shared/plugins/rpc')
    const deleteMergedBranch = vi.fn()
    const host = await createHost(undefined, undefined, undefined, undefined, { list: vi.fn(), remove: vi.fn(), pruneStale: vi.fn(), listMergedOrphanBranches: vi.fn(), deleteMergedBranch })
    host.setOriginResolver(() => 'user')
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 10, ctx: HOST_WORKTREES, method: '$deleteMergedBranch', args: ['p.user', 'proj-1', 'feat/x'] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    expect(deleteMergedBranch).not.toHaveBeenCalled()
  })

  it('$reveal pushes plugins:reveal-session to the renderer', async () => {
    const { HOST_AGENTS } = await import('../../shared/plugins/rpc')
    const host = await createHost()
    const send = vi.fn()
    host.setSend(send)
    host.setOriginResolver(() => 'builtin')
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.emit('message', { t: 'req', id: 6, ctx: HOST_AGENTS, method: '$reveal', args: ['p.builtin', 'sess-9', 'My title'] } satisfies RpcMessage)
    await settle()
    expect(send).toHaveBeenCalledWith('plugins:reveal-session', 'sess-9', 'My title')
  })

  it('HostTranscription.$get returns the resolver value for a builtin plugin', async () => {
    const { HOST_TRANSCRIPTION } = await import('../../shared/plugins/rpc')
    const host = await createHost()
    host.setOriginResolver(() => 'builtin')
    host.setTranscriptionResolver(() => ({ provider: 'openai', openaiApiKey: 'k' }))
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 7, ctx: HOST_TRANSCRIPTION, method: '$get', args: ['p.builtin'] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(true)
    expect((rep as { value: unknown }).value).toEqual({ provider: 'openai', openaiApiKey: 'k' })
  })

  it('rejects HostTranscription.$get from a non-builtin plugin at the main boundary', async () => {
    const { HOST_TRANSCRIPTION } = await import('../../shared/plugins/rpc')
    const resolver = vi.fn(() => ({ provider: 'openai' }))
    const host = await createHost()
    host.setOriginResolver(() => 'user')
    host.setTranscriptionResolver(resolver)
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    child.posted.length = 0
    child.emit('message', { t: 'req', id: 8, ctx: HOST_TRANSCRIPTION, method: '$get', args: ['p.user'] } satisfies RpcMessage)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(false)
    expect((rep as { error: string }).error).toMatch(/restricted to built-in plugins/)
    expect(resolver).not.toHaveBeenCalled()
  })
})

describe('ExtensionHost host-down cleanup + crash backoff', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.children.splice(0, mocks.children.length)
  })

  it('settles pending UI prompts when the host dies (no leak)', async () => {
    const { HOST_UI } = await import('../../shared/plugins/rpc')
    const host = await createHost()
    // A send fn must exist for the broker to register a pending entry (it forwards the
    // prompt to the renderer and parks the promise until the renderer replies).
    host.setSend(() => undefined)
    void host.executeContributedCommand('noop', []).catch(() => {})
    const child = latestChild()
    // A raw HOST_UI request opens a pending broker entry. We never answer it (the renderer
    // reply never comes), then crash the host. On host-down main must flush the broker,
    // settling the parked RPC to undefined instead of leaking it forever.
    child.emit('message', { t: 'req', id: 7, ctx: HOST_UI, method: '$showMessage', args: ['info', 'hi', []] } satisfies RpcMessage)
    await settle()
    // No reply yet — the prompt is parked awaiting a renderer answer.
    expect(lastReply(child)).toBeUndefined()
    child.emit('exit', 1)
    await settle()
    const rep = lastReply(child)
    expect(rep?.ok).toBe(true)
    expect((rep as { value: unknown }).value).toBeUndefined()
  })

  it('backs off re-forking after repeated crashes within the window', async () => {
    let clock = 0
    const host = await createHost(undefined, undefined, undefined, () => clock)
    // Crash the host CRASH_THRESHOLD (3) times in quick succession.
    for (let i = 0; i < 3; i++) {
      void host.executeContributedCommand('noop', []).catch(() => {})
      latestChild().emit('exit', 1)
      await settle()
    }
    const forksBefore = mocks.children.length
    // Immediately after the storm, a new ensure() must be refused (no new fork).
    await expect(host.deactivate('x')).resolves.toBeUndefined() // deactivate is a no-op (no endpoint), doesn't fork
    expect(() => host.setActiveContext({})).toThrow(/backing off/)
    expect(mocks.children.length).toBe(forksBefore)
    // After the backoff window elapses, a re-fork is allowed again.
    clock += 60_000
    host.setActiveContext({})
    expect(mocks.children.length).toBe(forksBefore + 1)
  })

  it('does not back off on clean (code 0) exits', async () => {
    let clock = 0
    const host = await createHost(undefined, undefined, undefined, () => clock)
    for (let i = 0; i < 5; i++) {
      void host.executeContributedCommand('noop', []).catch(() => {})
      latestChild().emit('exit', 0)
      clock += 100
      await settle()
    }
    const forksBefore = mocks.children.length
    // A clean exit never trips the breaker; the next ensure() forks immediately.
    host.setActiveContext({})
    expect(mocks.children.length).toBe(forksBefore + 1)
  })
})
