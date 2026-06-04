// src/plugin-host/activator.ts
import type { ManifoldContext, PluginModule } from '../shared/plugins/api-types'

export interface ActivationTarget { id: string; root: string; main: string; kind: 'manifold' | 'vscode'; capabilities?: string[] }

type LoadModule = (target: ActivationTarget) => PluginModule

interface ActivePlugin { module: PluginModule; context: ManifoldContext }

/** Loads plugin entry modules and runs their activate/deactivate lifecycle. */
export class Activator {
  private readonly active = new Map<string, ActivePlugin>()

  constructor(private readonly loadModule: LoadModule) {}

  isActive(id: string): boolean { return this.active.has(id) }

  async activate(target: ActivationTarget): Promise<void> {
    if (this.active.has(target.id)) return
    const module = this.loadModule(target)
    const context: ManifoldContext = { subscriptions: [], pluginUri: target.root }
    this.active.set(target.id, { module, context })
    await module.activate?.(context)
  }

  async deactivate(id: string): Promise<void> {
    const entry = this.active.get(id)
    if (!entry) return
    this.active.delete(id)
    await entry.module.deactivate?.()
    for (const sub of entry.context.subscriptions) {
      try { sub.dispose() } catch { /* ignore disposal errors */ }
    }
  }
}
