import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ChatMessage } from '../../shared/simple-types'

const CONFIG_DIR = path.join(os.homedir(), '.manifold')
const STATE_FILE = path.join(CONFIG_DIR, 'chat-history.json')

const MAX_MESSAGES_PER_PROJECT = 200

export class ChatStore {
  private state: Map<string, ChatMessage[]>

  constructor() {
    this.state = this.loadFromDisk()
  }

  private ensureConfigDir(): void {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }

  private loadFromDisk(): Map<string, ChatMessage[]> {
    try {
      if (!fs.existsSync(STATE_FILE)) {
        return new Map()
      }
      const raw = fs.readFileSync(STATE_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return new Map()
      }
      return new Map(Object.entries(parsed as Record<string, ChatMessage[]>))
    } catch {
      return new Map()
    }
  }

  private writeToDisk(): void {
    this.ensureConfigDir()
    const obj = Object.fromEntries(this.state)
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8')
  }

  get(projectId: string): ChatMessage[] | null {
    const messages = this.state.get(projectId)
    if (!messages) return null
    return messages.map(m => ({ ...m }))
  }

  set(projectId: string, messages: ChatMessage[]): void {
    const capped = messages.slice(-MAX_MESSAGES_PER_PROJECT)
    this.state.set(projectId, capped.map(m => ({ ...m })))
    this.writeToDisk()
  }

  delete(projectId: string): void {
    this.state.delete(projectId)
    this.writeToDisk()
  }
}
