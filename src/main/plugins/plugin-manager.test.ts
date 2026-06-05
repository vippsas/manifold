// src/main/plugins/plugin-manager.test.ts
import { describe, expect, it } from 'vitest'
import { viewContributionsOf, mergeConfigValue } from './plugin-manager'
import type { PluginDescriptor } from '../../shared/plugins/manifest'

const desc = (id: string, views: unknown[]): PluginDescriptor => ({
  id, root: '/x', origin: 'user',
  manifest: { name: id, publisher: 'p', version: '1.0.0', engines: { manifold: '^0.3.0' }, contributes: { views: views as never } },
})

describe('mergeConfigValue', () => {
  it('returns the override when it is defined', () => {
    expect(mergeConfigValue('user-value', 'manifest-default')).toBe('user-value')
  })
  it('falls back to manifestDefault when override is undefined', () => {
    expect(mergeConfigValue(undefined, 'manifest-default')).toBe('manifest-default')
  })
  it('returns undefined when both are undefined', () => {
    expect(mergeConfigValue(undefined, undefined)).toBeUndefined()
  })
  it('treats falsy override values (0, false, empty string) as defined', () => {
    expect(mergeConfigValue(0, 42)).toBe(0)
    expect(mergeConfigValue(false, true)).toBe(false)
    expect(mergeConfigValue('', 'default')).toBe('')
  })
})

describe('viewContributionsOf', () => {
  it('flattens views into PanelContributions tagged source=plugin', () => {
    const out = viewContributionsOf([
      desc('p.a', [{ id: 'a.view', title: 'A', description: 'desc', launcher: true }]),
      desc('p.b', [{ id: 'b.view', title: 'B' }]),
    ])
    expect(out).toEqual([
      { id: 'a.view', title: 'A', description: 'desc', launcher: true, source: 'plugin', pluginId: 'p.a', kind: 'webview' },
      { id: 'b.view', title: 'B', description: '', launcher: false, source: 'plugin', pluginId: 'p.b', kind: 'webview' },
    ])
  })
  it('sets kind=tree for views with type=tree', () => {
    const out = viewContributionsOf([desc('p.d', [{ id: 'd.view', title: 'D', type: 'tree', launcher: true }])])
    expect(out[0].kind).toBe('tree')
  })
  it('returns [] when a plugin has no views', () => {
    expect(viewContributionsOf([desc('p.c', [])])).toEqual([])
  })
})
