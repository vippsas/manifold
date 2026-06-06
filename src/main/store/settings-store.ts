import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ManifoldSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'
import { clearWatchSetupCache } from '../watch/setup-detector'

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
    const userProvisioners = settings.provisioning?.provisioners?.length
      ? settings.provisioning.provisioners.map((provisioner) => ({ ...provisioner }))
      : []
    const defaultBuiltins = (DEFAULT_SETTINGS.provisioning?.provisioners ?? []).filter(
      (p) => p.type === 'builtin',
    )
    const defaultBuiltinIds = new Set(defaultBuiltins.map((p) => p.id))
    const withoutStaleBuiltins = userProvisioners.filter(
      (p) => p.type !== 'builtin' || defaultBuiltinIds.has(p.id),
    )
    const missingBuiltins = defaultBuiltins.filter(
      (builtin) => !withoutStaleBuiltins.some((p) => p.id === builtin.id),
    )
    settings.provisioning = {
      provisioners: withoutStaleBuiltins.length || missingBuiltins.length
        ? [...withoutStaleBuiltins, ...missingBuiltins]
        : [...defaultBuiltins],
    }
    // One-time seed of the default-disabled plugin set (the bundled demo plugins).
    // `disabledPlugins` shipped after some configs were already written, so a plain
    // merge would let an old `disabledPlugins: []` shadow the default. Union the
    // defaults in once and mark it done, so a plugin the user later enables is not
    // re-disabled on the next launch.
    if (!settings.pluginDefaultsSeeded) {
      const seed = DEFAULT_SETTINGS.disabledPlugins ?? []
      settings.disabledPlugins = Array.from(new Set([...(settings.disabledPlugins ?? []), ...seed]))
      settings.pluginDefaultsSeeded = true
    }
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
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.settings, null, 2), 'utf-8')
  }

  getSettings(): ManifoldSettings {
    return { ...this.settings }
  }

  updateSettings(partial: Partial<ManifoldSettings>): ManifoldSettings {
    this.settings = { ...this.settings, ...partial }
    this.writeToDisk()
    if (partial.transcription) {
      clearWatchSetupCache()
    }
    return { ...this.settings }
  }
}
