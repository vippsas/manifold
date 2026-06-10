import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { VerdictRecord } from '../../shared/verdict-types'
import { writeFileAtomicSync } from './atomic-write'

const DEFAULT_PATH = path.join(os.homedir(), '.manifold', 'verdicts.json')
const MAX_PER_PROJECT = 1000

export class VerdictStore {
  private readonly file: string
  private records: VerdictRecord[]

  constructor(file: string = DEFAULT_PATH) {
    this.file = file
    this.records = this.loadFromDisk()
  }

  private loadFromDisk(): VerdictRecord[] {
    try {
      if (!fs.existsSync(this.file)) return []
      const raw = fs.readFileSync(this.file, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as VerdictRecord[]
    } catch {
      return []
    }
  }

  private writeToDisk(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    writeFileAtomicSync(this.file, JSON.stringify(this.records, null, 2))
  }

  upsert(record: VerdictRecord): void {
    const existing = this.records.findIndex((r) => r.sessionId === record.sessionId)
    if (existing >= 0) {
      this.records[existing] = record
    } else {
      this.records.push(record)
      this.evictIfNeeded(record.projectId)
    }
    this.writeToDisk()
  }

  private evictIfNeeded(projectId: string): void {
    const indicesForProject = this.records
      .map((r, i) => (r.projectId === projectId ? i : -1))
      .filter((i) => i >= 0)
    if (indicesForProject.length <= MAX_PER_PROJECT) return
    const evictCount = indicesForProject.length - MAX_PER_PROJECT
    const toDrop = new Set(indicesForProject.slice(0, evictCount))
    this.records = this.records.filter((_, i) => !toDrop.has(i))
  }

  deleteByProject(projectId: string): void {
    const before = this.records.length
    this.records = this.records.filter((r) => r.projectId !== projectId)
    if (this.records.length !== before) {
      this.writeToDisk()
    }
  }

  getBySessionId(sessionId: string): VerdictRecord | null {
    return this.records.find((r) => r.sessionId === sessionId) ?? null
  }

  listByProject(projectId: string, limit?: number): VerdictRecord[] {
    const all = this.records.filter((r) => r.projectId === projectId)
    return limit !== undefined ? all.slice(-limit) : all
  }
}
