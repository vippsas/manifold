import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeFileAtomicSync } from './atomic-write'

export interface SavedShellTab {
  label: string
  cwd: string
  mode?: 'manifold' | 'system'
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
      const valid = Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, SavedShellState] => isValidShellState(e[1]),
      )
      return new Map(valid)
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    writeFileAtomicSync(STATE_FILE, JSON.stringify(obj, null, 2))
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

/**
 * Validate the fields `get()` touches so a hand-edited/corrupt-but-valid-JSON
 * entry is dropped on load instead of throwing later (e.g. `entry.tabs.map(...)`).
 */
function isValidShellState(value: unknown): value is SavedShellState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.tabs) && typeof v.counter === 'number'
}
