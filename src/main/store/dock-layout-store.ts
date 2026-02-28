import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'dock-layout.json')

export class DockLayoutStore {
  private state: Map<string, unknown>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, unknown> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, unknown>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(sessionId: string): unknown | null {
    return this.state.get(sessionId) ?? null
  }

  set(sessionId: string, layout: unknown): void {
    this.state.set(sessionId, layout)
    this.writeToDisk()
  }

  delete(sessionId: string): void {
    this.state.delete(sessionId)
    this.writeToDisk()
  }
}
