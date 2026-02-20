import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { SessionViewState } from '../shared/types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'view-state.json')

export class ViewStateStore {
  private state: Map<string, SessionViewState>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, SessionViewState> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, SessionViewState>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(sessionId: string): SessionViewState | null {
    const entry = this.state.get(sessionId)
    if (!entry) return null
    return {
      ...entry,
      openFilePaths: [...entry.openFilePaths],
      expandedPaths: [...entry.expandedPaths],
    }
  }

  set(sessionId: string, viewState: SessionViewState): void {
    this.state.set(sessionId, { ...viewState })
    this.writeToDisk()
  }

  delete(sessionId: string): void {
    this.state.delete(sessionId)
    this.writeToDisk()
  }
}
