// src/main/plugins/plugin-manager.ts
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { scanPluginDir } from './scanner'
import { getBundledPluginsDir, getUserPluginsDir } from './plugin-paths'
import { debugLog } from '../app/debug-log'
import { ExtensionHost } from './extension-host'
import { PluginStorageStore } from './plugin-storage-store'

export interface PluginPanelContribution extends PanelContribution {
  pluginId: string
}

/** Pure: flatten plugin view contributions into renderer PanelContributions. */
export function viewContributionsOf(plugins: PluginDescriptor[]): PluginPanelContribution[] {
  const out: PluginPanelContribution[] = []
  for (const p of plugins) {
    for (const v of p.manifest.contributes?.views ?? []) {
      out.push({
        id: v.id,
        title: v.title,
        description: v.description ?? '',
        launcher: v.launcher ?? false,
        source: 'plugin',
        pluginId: p.id,
        kind: v.type === 'tree' ? 'tree' : 'webview',
      })
    }
  }
  return out
}

/** Pure helper: user override wins; falls back to manifest default; undefined when neither. */
export function mergeConfigValue(override: unknown, manifestDefault: unknown): unknown {
  return override !== undefined ? override : manifestDefault
}

export class PluginManager {
  private plugins: PluginDescriptor[] = []
  private readonly host: ExtensionHost

  constructor(private readonly storagePath: string, private readonly settings: import('../store/settings-store').SettingsStore) {
    this.host = new ExtensionHost(new PluginStorageStore(storagePath))
    this.host.setConfigResolver((id, key) => this.getConfigValue(id, key))
  }

  isEnabled(pluginId: string): boolean {
    return !(this.settings.getSettings().disabledPlugins ?? []).includes(pluginId)
  }

  setEnabled(pluginId: string, enabled: boolean): void {
    const cur = this.settings.getSettings().disabledPlugins ?? []
    const next = enabled ? cur.filter((id) => id !== pluginId) : Array.from(new Set([...cur, pluginId]))
    this.settings.updateSettings({ disabledPlugins: next })
  }

  getConfigValue(pluginId: string, key: string): unknown {
    const override = this.settings.getSettings().pluginConfig?.[pluginId]?.[key]
    const plugin = this.plugins.find((p) => p.id === pluginId)
    const manifestDefault = plugin?.manifest.contributes?.configuration?.properties?.[key]?.default
    return mergeConfigValue(override, manifestDefault)
  }

  getConfig(pluginId: string): { properties: Record<string, unknown>; values: Record<string, unknown> } {
    const plugin = this.plugins.find((p) => p.id === pluginId)
    const properties = plugin?.manifest.contributes?.configuration?.properties ?? {}
    const values: Record<string, unknown> = {}
    for (const key of Object.keys(properties)) values[key] = this.getConfigValue(pluginId, key)
    return { properties, values }
  }

  setConfig(pluginId: string, key: string, value: unknown): void {
    const current = this.settings.getSettings().pluginConfig ?? {}
    const pluginValues = { ...(current[pluginId] ?? {}), [key]: value }
    this.settings.updateSettings({ pluginConfig: { ...current, [pluginId]: pluginValues } })
    this.host.notifyConfigChanged(pluginId)
  }

  /** Discover built-in + user plugins. Errors are logged and skipped. */
  scan(): void {
    const builtin = scanPluginDir(getBundledPluginsDir(), 'builtin')
    const user = scanPluginDir(getUserPluginsDir(this.storagePath), 'user')
    this.plugins = [...builtin.plugins, ...user.plugins]
    for (const e of [...builtin.errors, ...user.errors]) {
      debugLog(`[plugins] skipped ${e.path}: ${e.error}`)
    }
    debugLog(`[plugins] discovered ${this.plugins.length} plugin(s)`)
  }

  listPlugins(): PluginDescriptor[] {
    return this.plugins
  }

  listViewContributions(): PluginPanelContribution[] {
    return viewContributionsOf(this.plugins.filter((p) => this.isEnabled(p.id)))
  }

  async activate(pluginId: string): Promise<void> {
    const p = this.plugins.find((x) => x.id === pluginId)
    if (!p || !p.manifest.main || !this.isEnabled(p.id)) return
    await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main, kind: p.kind, capabilities: p.manifest.capabilities ?? [] })
  }

  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    return this.host.executeContributedCommand(id, args)
  }

  setMainWindow(win: import('electron').BrowserWindow): void {
    this.host.setSend((channel, ...args) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args) })
  }

  async openView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) return
    await this.host.resolveView({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [] }, viewId)
  }

  async openTreeView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) return
    await this.host.activate({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [] })
  }

  async treeGetChildren(viewId: string, parentNodeId: string | undefined): Promise<unknown> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) return []
    return this.host.treeGetChildren({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, kind: plugin.kind, capabilities: plugin.manifest.capabilities ?? [] }, viewId, parentNodeId)
  }

  deliverWebviewMessage(viewId: string, message: unknown): void {
    this.host.deliverWebviewMessage(viewId, message)
  }

  resolveUiResponse(requestId: string, value: unknown): void { this.host.resolveUi(requestId, value) }

  setActiveContext(context: { project?: unknown; session?: unknown }): void {
    this.host.setActiveContext(context)
  }
}
