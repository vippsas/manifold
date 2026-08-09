// src/main/plugins/plugin-manager.test.ts
import { describe, expect, it, vi } from 'vitest'
import { viewContributionsOf, frameSourcesOf, mergeConfigValue, PluginManager } from './plugin-manager'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { ManifoldSettings } from '../../shared/types'
import { debugLog } from '../app/debug-log'

vi.mock('../app/debug-log', () => ({ debugLog: vi.fn(), flushDebugLog: vi.fn(), flushDebugLogSync: vi.fn() }))

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
  const mgr = new PluginManager('/tmp', store as never, {} as never, {} as never, {} as never, {} as never, {} as never)
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
  // The renderer's activity rail picks its glyph off this field, so it has to
  // survive the hop from manifest to contribution.
  it('carries the view icon through to the renderer contribution', () => {
    const out = viewContributionsOf([desc('p.e', [{ id: 'e.view', title: 'E', icon: 'chart' }])])
    expect(out[0].icon).toBe('chart')
    expect(viewContributionsOf([desc('p.f', [{ id: 'f.view', title: 'F' }])])[0].icon).toBeUndefined()
  })
})

describe('frameSourcesOf', () => {
  it('collects frameSources per view id, empty array for views without them', () => {
    const out = frameSourcesOf([
      desc('p.a', [{ id: 'a.view', title: 'A', frameSources: ['https://www.youtube.com'] }]),
      desc('p.b', [{ id: 'b.view', title: 'B' }]),
    ])
    expect(out).toEqual([
      ['a.view', ['https://www.youtube.com']],
      ['b.view', []],
    ])
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

  it('disabling a plugin calls host.deactivate; enabling does not', () => {
    const mgr = makeManager()
    const host = (mgr as never as { host: { deactivate: (id: string) => Promise<void> } }).host
    const deactivate = vi.spyOn(host, 'deactivate').mockResolvedValue(undefined)
    mgr.setEnabled('p.x', false)
    expect(deactivate).toHaveBeenCalledWith('p.x')
    deactivate.mockClear()
    mgr.setEnabled('p.x', true)
    expect(deactivate).not.toHaveBeenCalled()
  })

  it('deliverWebviewMessage is dropped when the owning plugin is disabled', () => {
    const mgr = makeManager()
    const host = (mgr as never as { host: { deliverWebviewMessage: (v: string, m: unknown) => void } }).host
    const deliver = vi.spyOn(host, 'deliverWebviewMessage').mockImplementation(() => {})
    ;(mgr as never as { plugins: PluginDescriptor[] }).plugins = [desc('p.v', [{ id: 'v.view', title: 'V' }])]
    mgr.setEnabled('p.v', false)
    deliver.mockClear()
    mgr.deliverWebviewMessage('v.view', { hi: true })
    expect(deliver).not.toHaveBeenCalled()
    mgr.setEnabled('p.v', true)
    mgr.deliverWebviewMessage('v.view', { hi: true })
    expect(deliver).toHaveBeenCalledWith('v.view', { hi: true })
  })

  it('dispose() tears down the plugin host', () => {
    const mgr = makeManager()
    const host = (mgr as never as { host: { dispose: () => void } }).host
    const dispose = vi.spyOn(host, 'dispose').mockImplementation(() => {})
    mgr.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
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

describe('PluginManager openView logging', () => {
  it('calls debugLog when no enabled plugin owns the viewId', async () => {
    const mgr = makeManager()
    vi.mocked(debugLog).mockClear()
    await mgr.openView('unknown.view')
    expect(debugLog).toHaveBeenCalledWith('[plugins] openView("unknown.view"): no enabled plugin owns this view')
  })
})

describe('hello-world sample plugins disabled by default', () => {
  const HELLO_IDS = ['manifold.hello', 'manifold.hello-tree', 'manifold.hello-vscode', 'mark-wiemer.helloworld-2022']

  it('reports each hello-world sample plugin as disabled under DEFAULT_SETTINGS', () => {
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
