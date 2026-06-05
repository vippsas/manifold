// src/main/plugins/plugin-manager.test.ts
import { describe, expect, it } from 'vitest'
import { viewContributionsOf, mergeConfigValue, PluginManager } from './plugin-manager'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { ManifoldSettings } from '../../shared/types'

const desc = (id: string, views: unknown[]): PluginDescriptor => ({
  id, root: '/x', origin: 'user', kind: 'manifold',
  manifest: { name: id, publisher: 'p', version: '1.0.0', engines: { manifold: '^0.3.0' }, contributes: { views: views as never } },
})

function makeManager(initial: Partial<ManifoldSettings> = {}) {
  let settings: ManifoldSettings = { storagePath: '/tmp', setupCompleted: false, lastSeenReleaseNotesVersion: '', defaultRuntime: 'claude', theme: 'dark', scrollbackLines: 5000, terminalFontFamily: '', defaultBaseBranch: 'main', notificationSound: true, shellPrompt: true, shellHistoryScope: 'project', uiMode: 'developer', autoGenerateMessages: true, showCommitAndPrButtons: false, sidebarResizeReversed: false, keepAwake: false, ...initial }
  const store = {
    getSettings: () => settings,
    updateSettings: (patch: Partial<ManifoldSettings>) => { settings = { ...settings, ...patch } },
  }
  const mgr = new PluginManager('/tmp', store as never)
  return mgr
}

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

describe('PluginManager enable/disable', () => {
  it('isEnabled defaults true; setEnabled persists disable then re-enable', () => {
    const mgr = makeManager()
    expect(mgr.isEnabled('manifold.x')).toBe(true)
    mgr.setEnabled('manifold.x', false)
    expect(mgr.isEnabled('manifold.x')).toBe(false)
    mgr.setEnabled('manifold.x', true)
    expect(mgr.isEnabled('manifold.x')).toBe(true)
  })

  it('listViewContributions hides disabled plugins', () => {
    const mgr = makeManager()
    // Seed plugins directly via the private field using type cast
    ;(mgr as never as { plugins: PluginDescriptor[] }).plugins = [
      desc('p.enabled', [{ id: 'enabled.view', title: 'Enabled', launcher: true }]),
      desc('p.disabled', [{ id: 'disabled.view', title: 'Disabled', launcher: true }]),
    ]
    mgr.setEnabled('p.disabled', false)
    const ids = mgr.listViewContributions().map((c) => c.pluginId)
    expect(ids).toContain('p.enabled')
    expect(ids).not.toContain('p.disabled')
  })
})

describe('bundled hello demo plugins disabled by default', () => {
  const HELLO_IDS = ['manifold.hello', 'manifold.hello-tree', 'manifold.hello-vscode']

  it('reports each bundled hello plugin as disabled under DEFAULT_SETTINGS', () => {
    const mgr = makeManager({ disabledPlugins: DEFAULT_SETTINGS.disabledPlugins })
    for (const id of HELLO_IDS) expect(mgr.isEnabled(id)).toBe(false)
  })

  it('keeps the bundled hello views out of the launcher by default, while other plugins stay visible', () => {
    const mgr = makeManager({ disabledPlugins: DEFAULT_SETTINGS.disabledPlugins })
    ;(mgr as never as { plugins: PluginDescriptor[] }).plugins = [
      desc('manifold.hello', [{ id: 'manifold.hello.panel', title: 'Hello', launcher: true }]),
      desc('manifold.hello-tree', [{ id: 'manifold.hello-tree.view', title: 'Hello Tree', launcher: true }]),
      desc('acme.real', [{ id: 'acme.real.view', title: 'Real', launcher: true }]),
    ]
    const ids = mgr.listViewContributions().map((c) => c.pluginId)
    expect(ids).toEqual(['acme.real'])
  })
})
