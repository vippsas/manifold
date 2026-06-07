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
  deliverWebviewMessage(viewId: string, message: unknown): void
  setActiveContext(context: { project?: unknown; session?: unknown }): void
  notifyConfigChanged(pluginId: string): void
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
})
