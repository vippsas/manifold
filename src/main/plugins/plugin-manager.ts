// src/main/plugins/plugin-manager.ts
import type { PluginDescriptor } from '../../shared/plugins/manifest'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { scanPluginDir } from './scanner'
import { getBundledPluginsDir, getUserPluginsDir } from './plugin-paths'
import { debugLog } from '../app/debug-log'

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

  constructor(private readonly storagePath: string) {}

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
}
