import { describe, expect, it, vi } from 'vitest'
import { RpcEndpoint, HOST_UI, type RpcMessage } from '../shared/plugins/rpc'
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
