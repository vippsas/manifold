import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  EMPTY_PROJECT_SEARCH_VIEW_STATE,
  type ProjectSearchViewState,
} from '../../shared/search-view-state'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'search-view-state.json')

export class SearchViewStore {
  private state: Map<string, ProjectSearchViewState>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, ProjectSearchViewState> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, ProjectSearchViewState>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(this.state), null, 2), 'utf-8')
  }

  get(projectId: string): ProjectSearchViewState {
    const entry = this.state.get(projectId)
    return cloneState(entry ?? EMPTY_PROJECT_SEARCH_VIEW_STATE)
  }

  set(projectId: string, viewState: ProjectSearchViewState): void {
    this.state.set(projectId, cloneState(viewState))
    this.writeToDisk()
  }
}

function cloneState(viewState: ProjectSearchViewState): ProjectSearchViewState {
  return {
    recent: viewState.recent.map((entry) => ({
      ...entry,
      snapshot: { ...entry.snapshot },
    })),
    saved: viewState.saved.map((entry) => ({
      ...entry,
      snapshot: { ...entry.snapshot },
    })),
  }
}
