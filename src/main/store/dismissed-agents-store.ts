import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { writeFileAtomicSync } from './atomic-write'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'dismissed-agents.json')

/**
 * Branches whose agent entry the user explicitly deleted, keyed by project id.
 * Session discovery consults this so a deleted dormant agent is not
 * resurrected from leftover branch checkout state (#679) — deleting an agent
 * keeps the local branch by design, so branch state alone must not imply a
 * visible agent. Entries are cleared when a new session is created on the
 * same project + branch.
 */
export class DismissedAgentsStore {
  private state: Map<string, Set<string>>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private loadFromDisk(): Map<string, Set<string>> {
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
        (e): e is [string, string[]] =>
          Array.isArray(e[1]) && e[1].every((b) => typeof b === 'string'),
      )
      return new Map(valid.map(([projectId, branches]) => [projectId, new Set(branches)]))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
    const obj = Object.fromEntries(
      Array.from(this.state.entries()).map(([projectId, branches]) => [projectId, [...branches]]),
    )
    writeFileAtomicSync(STATE_FILE, JSON.stringify(obj, null, 2))
  }

  add(projectId: string, branch: string): void {
    if (!branch) return
    const branches = this.state.get(projectId) ?? new Set()
    branches.add(branch)
    this.state.set(projectId, branches)
    this.writeToDisk()
  }

  has(projectId: string, branch: string): boolean {
    return this.state.get(projectId)?.has(branch) ?? false
  }

  delete(projectId: string, branch: string): void {
    const branches = this.state.get(projectId)
    if (!branches?.delete(branch)) return
    if (branches.size === 0) this.state.delete(projectId)
    this.writeToDisk()
  }

  deleteProject(projectId: string): void {
    if (!this.state.delete(projectId)) return
    this.writeToDisk()
  }
}
