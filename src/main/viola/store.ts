import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ViolaRun } from './types'

export interface ViolaStore {
  get(sessionId: string): Promise<ViolaRun | null>
  set(run: ViolaRun): Promise<void>
}

export class FileViolaStore implements ViolaStore {
  private readonly file: string
  private readonly legacyFile: string

  constructor(storageRoot: string) {
    this.file = join(storageRoot, 'viola-runs.json')
    this.legacyFile = join(storageRoot, 'conductor-runs.json')
  }

  async get(sessionId: string): Promise<ViolaRun | null> {
    return this.read()[sessionId] ?? null
  }

  async set(run: ViolaRun): Promise<void> {
    const runs = this.read()
    runs[run.baseSessionId] = run
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(runs, null, 2))
  }

  private read(): Record<string, ViolaRun> {
    const source = existsSync(this.file) ? this.file : this.legacyFile
    if (!existsSync(source)) return {}
    try {
      return JSON.parse(readFileSync(source, 'utf8')) as Record<string, ViolaRun>
    } catch {
      return {}
    }
  }
}

export class MemoryViolaStore implements ViolaStore {
  private runs = new Map<string, ViolaRun>()

  async get(sessionId: string): Promise<ViolaRun | null> {
    return this.runs.get(sessionId) ?? null
  }

  async set(run: ViolaRun): Promise<void> {
    this.runs.set(run.baseSessionId, run)
  }
}
