import type { ChatMessage } from '../shared/simple-types'

type MessageListener = (message: ChatMessage) => void

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

export class ChatAdapter {
  private messages = new Map<string, ChatMessage[]>()
  private listeners = new Map<string, Set<MessageListener>>()
  private nextId = 1
  // Buffer raw (unstripped) output per session; strip on flush
  private outputBuffers = new Map<string, { raw: string; timer: ReturnType<typeof setTimeout> }>()

  addUserMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'user', text)
  }

  addSystemMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'system', text)
  }

  addAgentMessage(sessionId: string, text: string): ChatMessage {
    return this.addMessage(sessionId, 'agent', text)
  }

  processPtyOutput(sessionId: string, rawOutput: string): void {
    // Accumulate raw output (including escape sequences) so that
    // sequences split across chunks are intact when we strip.
    const existing = this.outputBuffers.get(sessionId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.raw += rawOutput
    } else {
      this.outputBuffers.set(sessionId, { raw: rawOutput, timer: null! })
    }

    const timer = setTimeout(() => {
      const buf = this.outputBuffers.get(sessionId)
      if (buf) {
        const cleaned = normalizeText(stripAnsi(buf.raw))
        this.outputBuffers.delete(sessionId)
        if (cleaned.length > 0) {
          this.addAgentMessage(sessionId, cleaned)
        }
      }
    }, 300)

    this.outputBuffers.get(sessionId)!.timer = timer
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

  private addMessage(sessionId: string, role: ChatMessage['role'], text: string): ChatMessage {
    const message: ChatMessage = {
      id: `msg-${this.nextId++}`,
      sessionId,
      role,
      text,
      timestamp: Date.now(),
    }
    if (!this.messages.has(sessionId)) {
      this.messages.set(sessionId, [])
    }
    this.messages.get(sessionId)!.push(message)
    this.listeners.get(sessionId)?.forEach(fn => fn(message))
    return message
  }
}
