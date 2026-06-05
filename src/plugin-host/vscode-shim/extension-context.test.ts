import { describe, expect, it, vi } from 'vitest'
import { createExtensionContext } from './extension-context'

describe('extension context', () => {
  it('globalState reads/writes through HOST_STORAGE', async () => {
    const store = new Map<string, unknown>()
    const host = {
      $get: vi.fn((_id: string, key: string) => Promise.resolve(store.get(key))),
      $update: vi.fn((_id: string, key: string, value: unknown) => { store.set(key, value); return Promise.resolve() }),
    }
    const ctx = createExtensionContext({ host: host as never, pluginId: 'pub.ext', extensionPath: '/x' })
    expect(ctx.subscriptions).toEqual([])
    await ctx.globalState.update('count', 1)
    expect(await ctx.globalState.get('count')).toBe(1)
    expect(await ctx.globalState.get('missing', 'fallback')).toBe('fallback')
    expect(ctx.extensionPath).toBe('/x')
    expect(ctx.extensionUri.fsPath).toBe('/x')
  })

  it('namespaces workspaceState separately from globalState', async () => {
    const store = new Map<string, unknown>()
    const host = {
      $get: vi.fn((_id: string, key: string) => Promise.resolve(store.get(key))),
      $update: vi.fn((_id: string, key: string, value: unknown) => { store.set(key, value); return Promise.resolve() }),
    }
    const ctx = createExtensionContext({ host: host as never, pluginId: 'pub.ext', extensionPath: '/x' })
    await ctx.globalState.update('k', 'g')
    await ctx.workspaceState.update('k', 'w')
    expect(await ctx.globalState.get('k')).toBe('g')
    expect(await ctx.workspaceState.get('k')).toBe('w')
  })
})
