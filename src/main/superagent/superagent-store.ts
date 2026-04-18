import * as fs from 'node:fs'
import * as path from 'node:path'
import type { Superagent } from '../../shared/superagent-types'

export class SuperagentStore {
  private superagents: Superagent[]

  constructor(private readonly filePath: string) {
    this.superagents = this.loadFromDisk()
    this.sanitizeStaleStatuses()
  }

  // Any superagent persisted as running/waiting from a previous app
  // run is necessarily dormant — its PTY didn't survive the restart.
  private sanitizeStaleStatuses(): void {
    let changed = false
    for (const s of this.superagents) {
      if (s.status === 'running' || s.status === 'waiting') {
        s.status = 'done'
        s.pid = null
        changed = true
      }
    }
    if (changed) this.writeToDisk()
  }

  private loadFromDisk(): Superagent[] {
    try {
      if (!fs.existsSync(this.filePath)) return []
      const raw = fs.readFileSync(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? (parsed as Superagent[]) : []
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.superagents, null, 2))
  }

  list(): Superagent[] {
    return [...this.superagents]
  }

  get(id: string): Superagent | undefined {
    return this.superagents.find((s) => s.id === id)
  }

  add(superagent: Superagent): void {
    this.superagents.push(superagent)
    this.writeToDisk()
  }

  update(id: string, partial: Partial<Superagent>): Superagent | undefined {
    const idx = this.superagents.findIndex((s) => s.id === id)
    if (idx === -1) return undefined
    this.superagents[idx] = { ...this.superagents[idx], ...partial }
    this.writeToDisk()
    return this.superagents[idx]
  }

  remove(id: string): boolean {
    const before = this.superagents.length
    this.superagents = this.superagents.filter((s) => s.id !== id)
    if (this.superagents.length === before) return false
    this.writeToDisk()
    return true
  }

  addChild(id: string, childSessionId: string): void {
    const target = this.superagents.find((s) => s.id === id)
    if (!target) return
    if (!target.childSessionIds.includes(childSessionId)) {
      target.childSessionIds.push(childSessionId)
      this.writeToDisk()
    }
  }
}
