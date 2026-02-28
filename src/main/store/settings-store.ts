import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ManifoldSettings } from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

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
    return { ...this.settings }
  }
}
