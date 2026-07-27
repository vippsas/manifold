import type { ChatMessage } from '../../shared/simple-types'
import type { ChatStore } from '../store/chat-store'

type MessageListener = (message: ChatMessage) => void

// Cap the raw per-session PTY buffer so an interactive TUI repainting faster
// than the quiet-period debounce can't grow it without bound (mirrors the 100KB
// outputBuffer cap in session-stream-wirer).
const MAX_RAW_BUFFER_BYTES = 100_000
// Force a flush once the buffer is this old even if output never goes quiet,
// so a continuously-repainting turn can't defer the debounce indefinitely.
const MAX_BUFFER_AGE_MS = 3_000
// Cap the in-memory message array per session, matching the persisted store cap.
const MAX_MESSAGES_PER_SESSION = 200

/**
 * Strip all ANSI/VT100 escape sequences from terminal output.
 * Must be applied AFTER buffering raw chunks to avoid split-sequence artifacts.
 */
function stripAnsi(text: string): string {
  return text
    // Replace cursor-movement sequences with a space to preserve word boundaries.
    // TUI renderers (like ink) position text via cursor commands; stripping them
    // without a replacement causes words to concatenate.
    // Covers: CUU(A) CUD(B) CUF(C) CUB(D) CNL(E) CPL(F) CHA(G) CUP(H) CHT(I) VPA(d) HVP(f)
    // Must come BEFORE the general CSI strip.
    .replace(/\x1b\[\d*(?:;\d*)*[A-Ifd]/g, ' ')
    // CSI sequences: ESC [ (params) (intermediates) (final byte)
    // Covers colors, erase, scrolling, mode changes, etc.
    // Includes 256-color (\x1b[38;5;246m) and truecolor (\x1b[38;2;r;g;bm)
    .replace(/\x1b\[[\x20-\x3f]*[\x40-\x7e]/g, '')
    // OSC sequences: ESC ] ... (BEL or ST)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // Other ESC sequences (2-char): ESC + single char
    .replace(/\x1b[^[\]]/g, '')
    // Stray CSI fragments left from prior stripping or chunk boundaries
    // e.g. orphaned "[38;5;246m" without the leading ESC
    .replace(/\[[\d;]*m/g, '')
    // Control characters except newline and tab
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Tabs → spaces (for chat readability)
    .replace(/\t/g, ' ')
    // Carriage returns
    .replace(/\r/g, '')
}

/**
 * Clean up stripped terminal text into readable prose:
 * - Collapse runs of spaces (from cursor positioning) into single spaces
 * - Normalize line breaks
 * - Trim each line
 */
function normalizeText(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Parse the ---options--- / ---end--- block from agent text.
 * Returns the text with the block stripped and the extracted options (if any).
 */
export function parseOptions(text: string): { cleanText: string; options: string[] | undefined } {
  // Try with ---end--- first, then fall back to no closing marker
  const regex = /\n*---options---\s*\n([\s\S]*?)(?:---end---\s*$|$)/
  const match = regex.exec(text)
  if (!match || !match[1]?.trim()) return { cleanText: text, options: undefined }

  const optionsBlock = match[1]
  const options = optionsBlock
    .split('\n')
    .map(line => line.replace(/^\d+\.\s*/, '').trim())
    .filter(line => line.length > 0)

  if (options.length === 0) return { cleanText: text, options: undefined }

  const cleanText = text.replace(regex, '').trim()
  return { cleanText, options }
}

export class ChatAdapter {
  private messages = new Map<string, ChatMessage[]>()
  private listeners = new Map<string, Set<MessageListener>>()
  private nextId = 1
  // Buffer raw (unstripped) output per session; strip on flush
  private outputBuffers = new Map<string, { raw: string; timer: ReturnType<typeof setTimeout>; firstAppend: number }>()
  private chatStore: ChatStore | null = null
  private sessionStorage = new Map<string, { storageKey: string; projectId: string }>()

  setChatStore(store: ChatStore): void {
    this.chatStore = store
  }

  setSessionStorage(sessionId: string, storageKey: string, projectId: string): void {
    this.sessionStorage.set(sessionId, { storageKey, projectId })
  }

  loadMessages(sessionId: string, storageKey: string, projectId: string): ChatMessage[] {
    // Already have in-memory messages — return those
    const existing = this.messages.get(sessionId)
    if (existing && existing.length > 0) return existing

    // Try loading from persistent store
    const persisted = this.chatStore?.get(storageKey)
    if (!persisted || persisted.length === 0) {
      this.sessionStorage.set(sessionId, { storageKey, projectId })
      return []
    }

    // Re-key messages with the new sessionId
    const rekeyed = persisted.map(m => ({ ...m, sessionId }))
    this.messages.set(sessionId, rekeyed)
    this.sessionStorage.set(sessionId, { storageKey, projectId })

    // Update nextId to avoid collisions
    for (const m of rekeyed) {
      const num = parseInt(m.id.replace('msg-', ''), 10)
      if (!isNaN(num) && num >= this.nextId) {
        this.nextId = num + 1
      }
    }

    return rekeyed
  }

  addUserMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'user', text)
  }

  addSystemMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'system', text)
  }

  addAgentMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'agent', text)
  }

  addAgentMessageWithOptions(sessionId: string, text: string, options: string[]): ChatMessage {
    return this.addMessage(sessionId, 'agent', text, options)
  }

  processPtyOutput(sessionId: string, rawOutput: string): void {
    // Accumulate raw output (including escape sequences) so that
    // sequences split across chunks are intact when we strip.
    const existing = this.outputBuffers.get(sessionId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.raw += rawOutput
      // Cap the buffer so a TUI repainting faster than the debounce can't grow
      // it without bound (keep the most recent bytes — the current screen state).
      if (existing.raw.length > MAX_RAW_BUFFER_BYTES) {
        existing.raw = existing.raw.slice(-MAX_RAW_BUFFER_BYTES)
      }
    }

    // Force a flush if the buffer has aged past the max even though output keeps
    // arriving; otherwise the 300ms quiet-period debounce can be reset forever.
    const firstAppend = existing?.firstAppend ?? Date.now()
    const delay = existing
      ? Math.max(0, Math.min(300, firstAppend + MAX_BUFFER_AGE_MS - Date.now()))
      : 300

    const timer = setTimeout(() => {
      const buf = this.outputBuffers.get(sessionId)
      if (buf) {
        const cleaned = normalizeText(stripAnsi(buf.raw))
        this.outputBuffers.delete(sessionId)
        if (cleaned.length > 0) {
          this.addAgentMessage(sessionId, cleaned)
        }
      }
    }, delay)

    if (existing) {
      existing.timer = timer
    } else {
      this.outputBuffers.set(sessionId, { raw: rawOutput, timer, firstAppend })
    }
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.messages.get(sessionId) ?? []
  }

  onMessage(sessionId: string, listener: MessageListener): () => void {
    if (!this.listeners.has(sessionId)) {
      this.listeners.set(sessionId, new Set())
    }
    this.listeners.get(sessionId)!.add(listener)
    return () => {
      this.listeners.get(sessionId)?.delete(listener)
    }
  }

  /** Remove in-memory state for a session (messages, listeners, pending output buffer).
   *  Persisted chat history is NOT deleted — it survives restarts. */
  clearSession(sessionId: string, deletePersisted = false, persistedStorageKey?: string): void {
    const storage = this.sessionStorage.get(sessionId)
    const storageKey = persistedStorageKey ?? storage?.storageKey
    if (deletePersisted && storageKey) this.chatStore?.delete(storageKey)
    const buf = this.outputBuffers.get(sessionId)
    if (buf) {
      clearTimeout(buf.timer)
      this.outputBuffers.delete(sessionId)
    }
    this.listeners.delete(sessionId)
    this.messages.delete(sessionId)
    this.sessionStorage.delete(sessionId)
  }

  private addMessage(sessionId: string, role: ChatMessage['role'], text: string, options?: string[]): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${this.nextId++}`,
      sessionId,
      role,
      text,
      timestamp: Date.now(),
      ...(options && options.length > 0 ? { options } : {}),
    }
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, [])
    }
    const list = this.messages.get(sessionId)!
    list.push(message)
    // Cap the in-memory array, matching the persisted store cap, so a long turn
    // can't grow it without bound.
    if (list.length > MAX_MESSAGES_PER_SESSION) {
      list.splice(0, list.length - MAX_MESSAGES_PER_SESSION)
    }

    // Persist to disk if we know where to put it
    const storage = this.sessionStorage.get(sessionId)
    if (storage && this.chatStore) {
      this.chatStore.set(storage.storageKey, storage.projectId, this.messages.get(sessionId)!)
    }

    this.listeners.get(sessionId)?.forEach(fn => fn(message))
    return message
  }
}
