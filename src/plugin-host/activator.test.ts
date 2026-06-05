// src/plugin-host/activator.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Activator } from './activator'
import type { PluginModule } from '../shared/plugins/api-types'

describe('Activator', () => {
  it('calls activate with a context and tracks the plugin as active', async () => {
    const activate = vi.fn()
    const mod: PluginModule = { activate }
    const act = new Activator(() => mod)
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js', kind: 'manifold' })
    expect(activate).toHaveBeenCalledTimes(1)
    expect(act.isActive('p.a')).toBe(true)
  })

  it('is idempotent — activating twice runs activate once', async () => {
    const activate = vi.fn()
    const act = new Activator(() => ({ activate }))
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js', kind: 'manifold' })
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js', kind: 'manifold' })
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it('runs deactivate and disposes subscriptions', async () => {
    const dispose = vi.fn()
    const deactivate = vi.fn()
    const act = new Activator(
      () => ({ activate: (ctx) => { ctx.subscriptions.push({ dispose }) }, deactivate }),
    )
    await act.activate({ id: 'p.a', root: '/x', main: './out/p.js', kind: 'manifold' })
    await act.deactivate('p.a')
    expect(deactivate).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(act.isActive('p.a')).toBe(false)
  })
})
