import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ChatMessage } from '../../shared/simple-types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'chat-history.json')

const MAX_MESSAGES_PER_KEY = 200
const STORE_VERSION = 2

interface ChatEntry {
  projectId: string
  messages: ChatMessage[]
}

interface StoredFile {
  version: number
  entries: Record<string, ChatEntry>
}

export class ChatStore {
  private state: Map<string, ChatEntry>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, ChatEntry> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      const obj = parsed as Record<string, unknown>
      if (obj.version === STORE_VERSION && obj.entries && typeof obj.entries === 'object') {
        return new Map(Object.entries(obj.entries as Record<string, ChatEntry>))
      }
      // Older format keyed by projectId with no per-session scoping. Discard:
      // restoring it would re-pollute new chat-mode sessions with messages
      // from sibling sessions in the same project (see the gibberish bug).
      return new Map()
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const file: StoredFile = {
      version: STORE_VERSION,
      entries: Object.fromEntries(this.state),
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(file, null, 2), 'utf-8')
  }

  get(storageKey: string): ChatMessage[] | null {
    const entry = this.state.get(storageKey)
    if (!entry) return null
    return entry.messages.map(m => ({ ...m }))
  }

  set(storageKey: string, projectId: string, messages: ChatMessage[]): void {
    const capped = messages.slice(-MAX_MESSAGES_PER_KEY)
    this.state.set(storageKey, {
      projectId,
      messages: capped.map(m => ({ ...m })),
    })
    this.writeToDisk()
  }

  delete(storageKey: string): void {
    this.state.delete(storageKey)
    this.writeToDisk()
  }

  deleteByProject(projectId: string): void {
    let changed = false
    for (const [key, entry] of this.state) {
      if (entry.projectId === projectId) {
        this.state.delete(key)
        changed = true
      }
    }
    if (changed) this.writeToDisk()
  }
}
