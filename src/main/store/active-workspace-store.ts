import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeFileAtomicSync } from './atomic-write'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'active-workspace.json')

/**
 * The workspace the user last had selected, so a restart reopens where they
 * left off. Window-scoped UI state like the dock layout, not a user setting.
 */
export class ActiveWorkspaceStore {
  private workspaceId: string | null

  constructor() {
    this.workspaceId = this.loadFromDisk()
  }

  private loadFromDisk(): string | null {
    try {
      if (!fs.existsSync(STATE_FILE)) return null
      const parsed: unknown = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
      if (typeof parsed !== 'object' || parsed === null) return null
      const id = (parsed as { workspaceId?: unknown }).workspaceId
      return typeof id === 'string' ? id : null
    } catch {
      return null
    }
  }

  get(): string | null {
    return this.workspaceId
  }

  set(workspaceId: string | null): void {
    this.workspaceId = workspaceId
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileAtomicSync(STATE_FILE, JSON.stringify({ workspaceId }, null, 2))
  }
}
