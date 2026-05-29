import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import type { ChatMessage } from '../../shared/simple-types'

const MAX_MESSAGES_PER_KEY = 200
const STORE_VERSION = 3
const DEFAULT_FLUSH_DELAY_MS = 500

interface ChatEntry {
  projectId: string
  messages: ChatMessage[]
}

interface StoredSession {
  version: number
  storageKey: string
  projectId: string
  messages: ChatMessage[]
}

interface LegacyFile {
  version: number
  entries: Record<string, ChatEntry>
}

/**
 * Per-session chat persistence.
 *
 * Each storage key gets its own file under `<base>/chat/`, so a write only
 * serializes the messages of the session that changed — not every session.
 * Writes are coalesced and run asynchronously (debounced) to keep the Electron
 * main thread free while agents stream; `flushSync()` guarantees durability on
 * quit. This replaces the previous single `chat-history.json` that was rewritten
 * synchronously in full on every message (the multi-session slowdown/hang).
 */
export class ChatStore {
  private state = new Map<string, ChatEntry>()
  private fileNameByKey = new Map<string, string>()
  private dirty = new Set<string>()
  private removed = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly chatDir: string
  private readonly legacyFile: string
  private readonly flushDelayMs: number

  constructor(basePath?: string, flushDelayMs: number = DEFAULT_FLUSH_DELAY_MS) {
    const base = basePath ?? path.join(os.homedir(), '.manifold')
    this.chatDir = path.join(base, 'chat')
    this.legacyFile = path.join(base, 'chat-history.json')
    this.flushDelayMs = flushDelayMs
    this.migrateLegacyIfPresent()
    this.loadFromDisk()
  }

  get(storageKey: string): ChatMessage[] | null {
    const entry = this.state.get(storageKey)
    if (!entry) return null
    return entry.messages.map(m => ({ ...m }))
  }

  set(storageKey: string, projectId: string, messages: ChatMessage[]): void {
    const capped = messages.slice(-MAX_MESSAGES_PER_KEY).map(m => ({ ...m }))
    this.state.set(storageKey, { projectId, messages: capped })
    this.dirty.add(storageKey)
    this.removed.delete(this.fileNameFor(storageKey))
    this.scheduleFlush()
  }

  delete(storageKey: string): void {
    if (!this.state.has(storageKey)) return
    this.state.delete(storageKey)
    this.dirty.delete(storageKey)
    this.removed.add(this.fileNameFor(storageKey))
    this.scheduleFlush()
  }

  deleteByProject(projectId: string): void {
    let changed = false
    for (const [key, entry] of this.state) {
      if (entry.projectId === projectId) {
        this.state.delete(key)
        this.dirty.delete(key)
        this.removed.add(this.fileNameFor(key))
        changed = true
      }
    }
    if (changed) this.scheduleFlush()
  }

  /** Async coalesced flush of pending writes and removals. */
  async flush(): Promise<void> {
    const { keys, removals } = this.drainPending()
    if (keys.length === 0 && removals.length === 0) return
    await fs.promises.mkdir(this.chatDir, { recursive: true })
    for (const key of keys) {
      const entry = this.state.get(key)
      if (entry) await this.writeSessionFile(key, entry)
    }
    for (const file of removals) {
      await fs.promises.unlink(path.join(this.chatDir, file)).catch(() => undefined)
    }
  }

  /** Synchronous flush for the app-quit path; guarantees durability before exit. */
  flushSync(): void {
    const { keys, removals } = this.drainPending()
    if (keys.length === 0 && removals.length === 0) return
    fs.mkdirSync(this.chatDir, { recursive: true })
    for (const key of keys) {
      const entry = this.state.get(key)
      if (entry) this.writeSessionFileSync(key, entry)
    }
    for (const file of removals) {
      try {
        fs.unlinkSync(path.join(this.chatDir, file))
      } catch {
        // already gone
      }
    }
  }

  private drainPending(): { keys: string[]; removals: string[] } {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    const keys = [...this.dirty]
    const removals = [...this.removed]
    this.dirty.clear()
    this.removed.clear()
    return { keys, removals }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      void this.flush()
    }, this.flushDelayMs)
    this.flushTimer.unref?.()
  }

  private fileNameFor(storageKey: string): string {
    let name = this.fileNameByKey.get(storageKey)
    if (!name) {
      name = createHash('sha256').update(storageKey).digest('hex').slice(0, 32) + '.json'
      this.fileNameByKey.set(storageKey, name)
    }
    return name
  }

  private serialize(storageKey: string, entry: ChatEntry): string {
    const payload: StoredSession = {
      version: STORE_VERSION,
      storageKey,
      projectId: entry.projectId,
      messages: entry.messages,
    }
    return JSON.stringify(payload)
  }

  private async writeSessionFile(storageKey: string, entry: ChatEntry): Promise<void> {
    const full = path.join(this.chatDir, this.fileNameFor(storageKey))
    const tmp = `${full}.tmp`
    await fs.promises.writeFile(tmp, this.serialize(storageKey, entry), 'utf-8')
    await fs.promises.rename(tmp, full)
  }

  private writeSessionFileSync(storageKey: string, entry: ChatEntry): void {
    const full = path.join(this.chatDir, this.fileNameFor(storageKey))
    const tmp = `${full}.tmp`
    fs.writeFileSync(tmp, this.serialize(storageKey, entry), 'utf-8')
    fs.renameSync(tmp, full)
  }

  private loadFromDisk(): void {
    let files: string[]
    try {
      files = fs.readdirSync(this.chatDir)
    } catch {
      return // directory does not exist yet
    }
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = fs.readFileSync(path.join(this.chatDir, file), 'utf-8')
        const parsed = JSON.parse(raw) as Partial<StoredSession>
        if (
          parsed.version !== STORE_VERSION ||
          typeof parsed.storageKey !== 'string' ||
          !Array.isArray(parsed.messages)
        ) {
          continue
        }
        this.state.set(parsed.storageKey, {
          projectId: parsed.projectId ?? '',
          messages: parsed.messages,
        })
        this.fileNameByKey.set(parsed.storageKey, file)
      } catch {
        // skip corrupt file
      }
    }
  }

  /**
   * One-time migration of the old single-file store into per-session files.
   * Only v2 (storageKey-scoped) data is carried over; the older project-keyed
   * v1 format is discarded — restoring it would re-pollute new chat sessions
   * with messages from sibling sessions in the same project.
   */
  private migrateLegacyIfPresent(): void {
    let raw: string
    try {
      raw = fs.readFileSync(this.legacyFile, 'utf-8')
    } catch {
      return // no legacy file
    }
    try {
      const parsed = JSON.parse(raw) as Partial<LegacyFile>
      if (parsed.version === STORE_VERSION - 1 && parsed.entries && typeof parsed.entries === 'object') {
        fs.mkdirSync(this.chatDir, { recursive: true })
        for (const [storageKey, entry] of Object.entries(parsed.entries)) {
          this.writeSessionFileSync(storageKey, {
            projectId: entry.projectId,
            messages: entry.messages ?? [],
          })
        }
      }
    } catch {
      // Malformed legacy file — leave its contents untouched (see below).
    }
    // Never delete the original. Rename it to a .bak so the one-time migration
    // does not re-run, while guaranteeing no chat history is ever lost — even if
    // the format was unrecognized and nothing was migrated above.
    try {
      fs.renameSync(this.legacyFile, `${this.legacyFile}.bak`)
    } catch {
      // ignore
    }
  }
}
