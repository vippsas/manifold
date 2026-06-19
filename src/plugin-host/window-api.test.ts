import { describe, expect, it, vi } from 'vitest'
import { RpcEndpoint, HOST_WINDOW, HOST_UI, type RpcMessage } from '../shared/plugins/rpc'
import { createWindowApi } from './window-api'
import type { QuickPickItem, QuickPickOptions } from '../shared/plugins/ui'

// Wire a "host" (plugin-host side) and "main" RpcEndpoint to each other in-memory,
// with async (queueMicrotask) delivery so the awaits in showQuickPick resolve.
function wireHostAndMain(): { host: RpcEndpoint; main: RpcEndpoint } {
  let host!: RpcEndpoint
  let main!: RpcEndpoint
  main = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void host.handleMessage(m)) })
  host = new RpcEndpoint({ post: (m: RpcMessage) => queueMicrotask(() => void main.handleMessage(m)) })
  return { host, main }
}

describe('createWindowApi resolveView logging', () => {
  it('logs console.error when no provider is registered for the viewId', async () => {
    const { host } = wireHostAndMain()
    const { resolveView } = createWindowApi(host)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await resolveView('unregistered.id')
    expect(spy).toHaveBeenCalledWith('[plugin-host] resolveView: no WebviewViewProvider registered for "unregistered.id"')
    spy.mockRestore()
  })
})

function wireWithHostServices(): { host: RpcEndpoint; main: RpcEndpoint } {
  const { host, main } = (() => {
    let h!: RpcEndpoint
    let m!: RpcEndpoint
    m = new RpcEndpoint({ post: (msg: RpcMessage) => queueMicrotask(() => void h.handleMessage(msg)) })
    h = new RpcEndpoint({ post: (msg: RpcMessage) => queueMicrotask(() => void m.handleMessage(msg)) })
    return { host: h, main: m }
  })()
  main.registerService(HOST_WINDOW, {
    $setHtml: () => Promise.resolve(),
    $postToWebview: () => Promise.resolve(),
  })
  main.registerService(HOST_UI, {
    $showMessage: () => Promise.resolve(undefined),
    $showQuickPick: () => Promise.resolve(undefined),
    $showInputBox: () => Promise.resolve(undefined),
    $openExternal: () => Promise.resolve(),
  })
  return { host, main }
}

describe('deliverMessage per-listener error isolation', () => {
  it('a throwing listener does not prevent subsequent listeners from receiving the message', () => {
    const { host } = wireWithHostServices()
    const { windowApi, resolveView, deliverMessage } = createWindowApi(host)

    const received: unknown[] = []
    windowApi.registerWebviewViewProvider('test.view', {
      resolveWebviewView(view) {
        view.webview.onDidReceiveMessage(() => { throw new Error('listener boom') })
        view.webview.onDidReceiveMessage((m) => received.push(m))
      },
    })

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    void resolveView('test.view')
    deliverMessage('test.view', { type: 'ping' })

    expect(received).toEqual([{ type: 'ping' }])
    expect(errorSpy).toHaveBeenCalledWith('[plugin-host] deliverMessage: listener threw', expect.any(Error))
    errorSpy.mockRestore()
  })
})

describe('resolveView listener-set lifecycle', () => {
  it('re-resolving a view does not orphan listeners registered in the first resolution', async () => {
    const { host } = wireWithHostServices()
    const { windowApi, resolveView, deliverMessage } = createWindowApi(host)

    const received: unknown[] = []
    windowApi.registerWebviewViewProvider('test.view', {
      resolveWebviewView(view) {
        view.webview.onDidReceiveMessage((m) => received.push(m))
      },
    })

    await resolveView('test.view')
    // Re-resolve without re-registering a listener (simulates provider not re-registering)
    await resolveView('test.view')
    deliverMessage('test.view', { type: 'after-reresolve' })

    expect(received).toContainEqual({ type: 'after-reresolve' })
  })

  it('re-resolving a view does not accumulate listeners (one delivery per message)', async () => {
    const { host } = wireWithHostServices()
    const { windowApi, resolveView, deliverMessage } = createWindowApi(host)

    // A provider registers a fresh handler on every resolve (the normal shape —
    // e.g. the watch plugin's webview-host). Each panel remount triggers a new
    // resolveView; stale handlers from prior resolutions must not double-handle.
    const received: unknown[] = []
    windowApi.registerWebviewViewProvider('test.view', {
      resolveWebviewView(view) {
        view.webview.onDidReceiveMessage((m) => received.push(m))
      },
    })

    await resolveView('test.view')
    await resolveView('test.view')
    await resolveView('test.view')
    deliverMessage('test.view', { type: 'run' })

    expect(received).toEqual([{ type: 'run' }])
  })
})

describe('createWindowApi openExternal', () => {
  it('forwards the url to the host UI $openExternal', async () => {
    const { host, main } = wireHostAndMain()
    const opened: string[] = []
    main.registerService(HOST_UI, {
      $showMessage: () => Promise.resolve(undefined),
      $showQuickPick: () => Promise.resolve(undefined),
      $showInputBox: () => Promise.resolve(undefined),
      $openExternal: (url: string) => { opened.push(url); return Promise.resolve() },
    })
    const { windowApi } = createWindowApi(host)
    await windowApi.openExternal('https://github.com/o/r/pull/9')
    expect(opened).toEqual(['https://github.com/o/r/pull/9'])
  })
})

describe('createWindowApi showQuickPick return contract', () => {
  it('string[] input → string out; QuickPickItem[] input → item out', async () => {
    const { host, main } = wireHostAndMain()
    const seen: Array<{ items: QuickPickItem[]; options: QuickPickOptions }> = []
    main.registerService(HOST_UI, {
      $showMessage: () => Promise.resolve(undefined),
      $showQuickPick: (items: QuickPickItem[], options: QuickPickOptions) => {
        seen.push({ items, options })
        return Promise.resolve({ label: 'Green' })
      },
      $showInputBox: () => Promise.resolve(undefined),
    })

    const { windowApi } = createWindowApi(host)

    // string[] in → the picked string out (vscode's string[] contract)
    expect(await windowApi.showQuickPick(['Red', 'Green', 'Blue'])).toBe('Green')
    // QuickPickItem[] in → the picked item out
    expect(await windowApi.showQuickPick([{ label: 'Green', description: 'g' }])).toEqual({ label: 'Green' })

    // Both calls normalized to QuickPickItem[] over the wire.
    expect(seen[0].items).toEqual([{ label: 'Red' }, { label: 'Green' }, { label: 'Blue' }])
    expect(seen[1].items).toEqual([{ label: 'Green', description: 'g' }])
  })
})
