import type { ChatMessage } from '../shared/simple-types'

type MessageListener = (message: ChatMessage) => void

// Comprehensive ANSI/terminal escape sequence stripping
function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '') // CSI sequences (handles ? and other intermediates)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')          // OSC sequences
    .replace(/\x1b[()][A-Z0-9]/g, '')                            // Character set selection
    .replace(/\x1b[=>]/g, '')                                    // Keypad mode
    .replace(/\r/g, '')                                          // Carriage returns
}

export class ChatAdapter {
  private messages = new Map<string, ChatMessage[]>()
  private listeners = new Map<string, Set<MessageListener>>()
  private nextId = 1
  private outputBuffers = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>()

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
    const cleaned = stripAnsi(rawOutput).trim()
    if (cleaned.length === 0) return

    // Buffer output chunks and flush after 300ms of silence
    // so fragmented PTY output becomes coherent messages.
    const existing = this.outputBuffers.get(sessionId)
    if (existing) {
      clearTimeout(existing.timer)
      existing.text += '\n' + cleaned
    } else {
      this.outputBuffers.set(sessionId, { text: cleaned, timer: null! })
    }

    const timer = setTimeout(() => {
      const buf = this.outputBuffers.get(sessionId)
      if (buf && buf.text.length > 0) {
        this.addAgentMessage(sessionId, buf.text)
        this.outputBuffers.delete(sessionId)
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
