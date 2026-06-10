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

async function createHost(): Promise<HostForTest> {
  const { ExtensionHost } = await import('./extension-host')
  return new ExtensionHost(
    { get: vi.fn(), update: vi.fn() },
    { runTurn: vi.fn(), cancelTurn: vi.fn() },
    { selectChatModels: vi.fn(), sendRequest: vi.fn() },
  )
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
