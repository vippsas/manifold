// src/main/plugins/plugin-manager.test.ts
import { describe, expect, it } from 'vitest'
import { viewContributionsOf } from './plugin-manager'
import type { PluginDescriptor } from '../../shared/plugins/manifest'

const desc = (id: string, views: unknown[]): PluginDescriptor => ({
  id, root: '/x', origin: 'user',
  manifest: { name: id, publisher: 'p', version: '1.0.0', engines: { manifold: '^0.3.0' }, contributes: { views: views as never } },
})

describe('viewContributionsOf', () => {
  it('flattens views into PanelContributions tagged source=plugin', () => {
    const out = viewContributionsOf([
      desc('p.a', [{ id: 'a.view', title: 'A', description: 'desc', launcher: true }]),
      desc('p.b', [{ id: 'b.view', title: 'B' }]),
    ])
    expect(out).toEqual([
      { id: 'a.view', title: 'A', description: 'desc', launcher: true, source: 'plugin', pluginId: 'p.a' },
      { id: 'b.view', title: 'B', description: '', launcher: false, source: 'plugin', pluginId: 'p.b' },
    ])
  })
  it('returns [] when a plugin has no views', () => {
    expect(viewContributionsOf([desc('p.c', [])])).toEqual([])
  })
})
