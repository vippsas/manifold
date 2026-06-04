// src/main/plugins/plugin-storage-store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Per-plugin key/value JSON storage under <storageRoot>/plugin-storage/<id>.json. */
export class PluginStorageStore {
  constructor(private readonly storageRoot: string) {}

  private fileFor(pluginId: string): string {
    return join(this.storageRoot, 'plugin-storage', `${pluginId}.json`)
  }

  private read(pluginId: string): Record<string, unknown> {
    const file = this.fileFor(pluginId)
    if (!existsSync(file)) return {}
    try { return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> } catch { return {} }
  }

  get(pluginId: string, key: string): unknown {
    return this.read(pluginId)[key]
  }

  update(pluginId: string, key: string, value: unknown): void {
    const data = this.read(pluginId)
    if (value === undefined) delete data[key]
    else data[key] = value
    const file = this.fileFor(pluginId)
    mkdirSync(join(this.storageRoot, 'plugin-storage'), { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 2))
  }
}
