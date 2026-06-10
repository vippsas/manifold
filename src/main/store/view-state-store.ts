import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { SessionViewState } from '../../shared/types'
import { writeFileAtomicSync } from './atomic-write'

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
      const valid = Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, SessionViewState] => isValidViewState(e[1]),
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

  get(sessionId: string): SessionViewState | null {
    const entry = this.state.get(sessionId)
    if (!entry) return null
    return {
      ...entry,
      openFilePaths: [...entry.openFilePaths],
      expandedPaths: [...entry.expandedPaths],
      editorPanes: entry.editorPanes?.map((pane) => ({
        ...pane,
        openFilePaths: [...pane.openFilePaths],
      })),
    }
  }

  set(sessionId: string, viewState: SessionViewState): void {
    this.state.set(sessionId, {
      ...viewState,
      openFilePaths: [...viewState.openFilePaths],
      expandedPaths: [...viewState.expandedPaths],
      editorPanes: viewState.editorPanes?.map((pane) => ({
        ...pane,
        openFilePaths: [...pane.openFilePaths],
      })),
    })
    this.writeToDisk()
  }

  delete(sessionId: string): void {
    this.state.delete(sessionId)
    this.writeToDisk()
  }
}

/**
 * Validate the fields `get()` touches so a hand-edited/corrupt-but-valid-JSON
 * entry is dropped on load instead of throwing later (e.g. `[...entry.openFilePaths]`).
 */
function isValidViewState(value: unknown): value is SessionViewState {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.openFilePaths) || !Array.isArray(v.expandedPaths)) return false
  if (v.editorPanes !== undefined) {
    if (!Array.isArray(v.editorPanes)) return false
    if (!v.editorPanes.every((pane) => Array.isArray((pane as { openFilePaths?: unknown })?.openFilePaths))) {
      return false
    }
  }
  return true
}
