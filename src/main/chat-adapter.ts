import type { ChatMessage } from '../shared/simple-types'

type MessageListener = (message: ChatMessage) => void

export class ChatAdapter {
  private messages = new Map<string, ChatMessage[]>()
  private listeners = new Map<string, Set<MessageListener>>()
  private nextId = 1

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
    const cleaned = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (cleaned.length === 0) return
    this.addAgentMessage(sessionId, cleaned)
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
