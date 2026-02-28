import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

export interface SavedShellTab {
  label: string
  cwd: string
}

export interface SavedShellState {
  tabs: SavedShellTab[]
  counter: number
}

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'shell-tabs.json')

export class ShellTabStore {
  private state: Map<string, SavedShellState>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, SavedShellState> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, SavedShellState>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(agentKey: string): SavedShellState | null {
    const entry = this.state.get(agentKey)
    if (!entry) return null
    return {
      tabs: entry.tabs.map((t) => ({ ...t })),
      counter: entry.counter,
    }
  }

  set(agentKey: string, state: SavedShellState): void {
    this.state.set(agentKey, { tabs: state.tabs.map((t) => ({ ...t })), counter: state.counter })
    this.writeToDisk()
  }

  delete(agentKey: string): void {
    this.state.delete(agentKey)
    this.writeToDisk()
  }
}
