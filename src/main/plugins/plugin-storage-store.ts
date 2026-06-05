// src/main/plugins/plugin-storage-store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { debugLog } from '../app/debug-log'

/** Per-plugin key/value JSON storage under <storageRoot>/plugin-storage/<id>.json. */
export class PluginStorageStore {
  constructor(private readonly storageRoot: string) {}

  private fileFor(pluginId: string): string {
    // Defense in depth: even though plugin ids are charset-validated at manifest
    // parse time, never let an id escape the plugin-storage directory.
    const dir = resolve(this.storageRoot, 'plugin-storage')
    const file = resolve(dir, `${pluginId}.json`)
    if (file !== `${dir}${sep}${pluginId}.json` || !file.startsWith(dir + sep)) {
      throw new Error(`unsafe plugin id for storage: ${pluginId}`)
    }
    return file
  }

  private read(pluginId: string): Record<string, unknown> {
    const file = this.fileFor(pluginId)
    if (!existsSync(file)) return {}
    const raw = readFileSync(file, 'utf8')
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch (e) {
      // A corrupt file must not silently present as empty state and then get
      // overwritten by the next update() — that turns "data is corrupt" into
      // "data is gone". Log it, and back up the raw bytes so they're recoverable.
      this.backupCorrupt(file, raw)
      debugLog(`[plugins] corrupt storage file ${file}: ${e instanceof Error ? e.message : String(e)}`)
      return {}
    }
  }

  /**
   * Preserve the raw bytes of a corrupt storage file to a sibling `.bak` before
   * the next write clobbers them. Best-effort: a single `.bak` is kept (we never
   * overwrite an existing backup, so the first/original corrupt copy survives),
   * and any backup failure is swallowed so it can never throw out of read().
   */
  private backupCorrupt(file: string, raw: string): void {
    try {
      const bak = `${file}.bak`
      if (existsSync(bak)) return
      writeFileSync(bak, raw)
    } catch {
      // Best-effort: never let a backup failure surface as a read error.
    }
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
