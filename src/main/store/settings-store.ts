import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ManifoldSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { writeFileAtomicSync } from './atomic-write'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export class SettingsStore {
  private settings: ManifoldSettings

  constructor() {
    this.settings = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private resolveDefaults(settings: ManifoldSettings): ManifoldSettings {
    if (!settings.storagePath) {
      settings.storagePath = path.join(os.homedir(), '.manifold')
    }
    settings.memory = {
      ...DEFAULT_SETTINGS.memory,
      ...settings.memory,
    }
    settings.search = {
      ai: {
        ...DEFAULT_SETTINGS.search.ai,
        ...settings.search?.ai,
      },
    }
    // The optional `editor?` field types both operands as `EditorSettings | undefined`,
    // so the spread widens to a partial; assert back to the complete type.
    settings.editor = {
      ...DEFAULT_SETTINGS.editor,
      ...settings.editor,
    } as ManifoldSettings['editor']
    // Same widening as `editor` above: the optional `notifications?` field types
    // both operands as possibly-undefined, so the spread is asserted back to the
    // complete type.
    settings.notifications = {
      ...DEFAULT_SETTINGS.notifications,
      ...settings.notifications,
    } as ManifoldSettings['notifications']
    // The external provisioner flow was removed; scrub the now-orphaned `provisioning`
    // field from configs written by older builds so it is not re-persisted on every write.
    delete (settings as { provisioning?: unknown }).provisioning
    // Seed the default-disabled plugin set into `disabledPlugins`, once per id: a
    // plain merge would let an already-written `disabledPlugins: []` shadow the
    // default. Tracking which ids were seeded (rather than a single "seeded" flag)
    // means a plugin that becomes default-disabled in a later release still reaches
    // existing configs, while a plugin the user has since enabled is never re-disabled.
    const seeded = new Set(settings.seededDisabledPlugins ?? [])
    const unseeded = (DEFAULT_SETTINGS.disabledPlugins ?? []).filter((id) => !seeded.has(id))
    if (unseeded.length > 0) {
      settings.disabledPlugins = Array.from(new Set([...(settings.disabledPlugins ?? []), ...unseeded]))
      settings.seededDisabledPlugins = [...seeded, ...unseeded]
    }
    // The boolean marker this replaced is orphaned; scrub it so it is not re-persisted.
    delete (settings as { pluginDefaultsSeeded?: unknown }).pluginDefaultsSeeded
    return settings
  }

  private loadFromDisk(): ManifoldSettings {
    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return this.resolveDefaults({ ...DEFAULT_SETTINGS })
      }
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) {
        return this.resolveDefaults({ ...DEFAULT_SETTINGS })
      }
      return this.resolveDefaults({ ...DEFAULT_SETTINGS, ...(parsed as Partial<ManifoldSettings>) })
    } catch {
      return this.resolveDefaults({ ...DEFAULT_SETTINGS })
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    writeFileAtomicSync(CONFIG_FILE, JSON.stringify(this.settings, null, 2))
  }

  getSettings(): ManifoldSettings {
    return { ...this.settings }
  }

  updateSettings(partial: Partial<ManifoldSettings>): ManifoldSettings {
    this.settings = { ...this.settings, ...partial }
    this.writeToDisk()
    return { ...this.settings }
  }
}
