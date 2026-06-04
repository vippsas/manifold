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
      })
    }
  }
  return out
}

export class PluginManager {
  private plugins: PluginDescriptor[] = []
  private readonly host: ExtensionHost

  constructor(private readonly storagePath: string) {
    this.host = new ExtensionHost(new PluginStorageStore(storagePath))
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
    return viewContributionsOf(this.plugins)
  }

  async activate(pluginId: string): Promise<void> {
    const p = this.plugins.find((x) => x.id === pluginId)
    if (!p || !p.manifest.main) return
    await this.host.activate({ id: p.id, root: p.root, main: p.manifest.main, capabilities: p.manifest.capabilities ?? [] })
  }

  executeContributedCommand(id: string, args: unknown[]): Promise<unknown> {
    return this.host.executeContributedCommand(id, args)
  }

  setMainWindow(win: import('electron').BrowserWindow): void {
    this.host.setSend((channel, ...args) => { if (!win.isDestroyed()) win.webContents.send(channel, ...args) })
  }

  async openView(viewId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.contributes?.views?.some((v) => v.id === viewId))
    if (!plugin || !plugin.manifest.main) return
    await this.host.resolveView({ id: plugin.id, root: plugin.root, main: plugin.manifest.main, capabilities: plugin.manifest.capabilities ?? [] }, viewId)
  }

  deliverWebviewMessage(viewId: string, message: unknown): void {
    this.host.deliverWebviewMessage(viewId, message)
  }

  setActiveContext(context: { project?: unknown; session?: unknown }): void {
    this.host.setActiveContext(context)
  }
}
