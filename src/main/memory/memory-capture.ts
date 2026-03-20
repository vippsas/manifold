import type { ChatAdapter } from '../agent/chat-adapter'
import type { ChatMessage } from '../../shared/simple-types'
import type { AgentSession } from '../../shared/types'
import type { MemoryStore } from './memory-store'
import type { MemoryCompressor } from './memory-compressor'

const MEMORY_CONTEXT_REGEX = /<!-- manifold:memory-context:start -->[\s\S]*?<!-- manifold:memory-context:end -->/g
const INCREMENTAL_COMPRESSION_INTERVAL = 5

/** Returns true if the message is CLI noise that should not be stored */
export function isNoise(text: string): boolean {
  // Too short to be meaningful
  if (text.length < 15) return true
  // Spaced-out TUI artifacts: "d e c i d e t o", "W h a t i s A z u r e"
  // Detected when collapsing spaces shrinks the text by more than 40%
  const collapsed = text.replace(/ /g, '')
  if (collapsed.length < text.length * 0.6) return true
  // Mostly non-alphanumeric (ASCII art, line drawings, banners)
  const alphanumCount = (text.match(/[a-zA-Z0-9]/g) || []).length
  if (alphanumCount / text.length < 0.4) return true
  // CLI status bars: "› task model · 100% left · path"
  if (/›.*\d+%\s*(left|remaining)/i.test(text)) return true
  // CLI startup banners / dividers
  if (/^[-─═_]{3,}/.test(text)) return true
  // Repeated terminal UI fragments (table borders)
  if (/^\s*\|.*\|\s*$/.test(text) && text.split('\n').length <= 2) return true
  // Agent progress/spinner lines
  if (/^(⠋|⠙|⠹|⠸|⠼|⠴|⠦|⠧|⠇|⠏|\|\/|-|\\)/.test(text.trim())) return true
  // Worktree path-only messages
  if (/^~?\/.manifold\/worktrees\//.test(text.trim())) return true
  return false
}

export class MemoryCapture {
  private unsubscribers = new Map<string, () => void>()
  private interactionCounts = new Map<string, number>()
  private lastCompressedTimestamp = new Map<string, number>()
  private memoryCompressor: MemoryCompressor | null = null

  constructor(
    private chatAdapter: ChatAdapter,
    private memoryStore: MemoryStore,
    private sessionResolver: (sessionId: string) => AgentSession | undefined,
  ) {}

  setMemoryCompressor(compressor: MemoryCompressor): void {
    this.memoryCompressor = compressor
  }

  startCapturing(sessionId: string): void {
    // Avoid double-subscribing
    if (this.unsubscribers.has(sessionId)) return

    const session = this.sessionResolver(sessionId)
    if (session?.projectId) {
      this.memoryStore.upsertSession(
        session.projectId,
        sessionId,
        session.runtimeId,
        session.branchName,
        session.taskDescription,
      )
    }

    const unsubscribe = this.chatAdapter.onMessage(sessionId, (message: ChatMessage) => {
      this.onMessage(sessionId, message)
    })
    this.unsubscribers.set(sessionId, unsubscribe)
  }

  stopCapturing(sessionId: string): void {
    const unsubscribe = this.unsubscribers.get(sessionId)
    if (unsubscribe) {
      unsubscribe()
      this.unsubscribers.delete(sessionId)
    }
    this.interactionCounts.delete(sessionId)
    this.lastCompressedTimestamp.delete(sessionId)
  }

  private onMessage(sessionId: string, message: ChatMessage): void {
    const session = this.sessionResolver(sessionId)
    // Skip shell sessions (no projectId)
    if (!session?.projectId) return

    // Strip memory context markers to prevent feedback loops
    const cleanText = message.text.replace(MEMORY_CONTEXT_REGEX, '').trim()
    if (!cleanText || isNoise(cleanText)) return

    this.memoryStore.insertInteraction(
      session.projectId,
      sessionId,
      message.role,
      cleanText,
      message.timestamp,
    )

    // Track interaction count and trigger incremental compression
    const count = (this.interactionCounts.get(sessionId) ?? 0) + 1
    this.interactionCounts.set(sessionId, count)

    if (this.memoryCompressor && count % INCREMENTAL_COMPRESSION_INTERVAL === 0) {
      const sinceTs = this.lastCompressedTimestamp.get(sessionId) ?? 0
      const newTs = this.memoryCompressor.compressIncremental(
        session.projectId,
        sessionId,
        sinceTs,
      )
      this.lastCompressedTimestamp.set(sessionId, newTs)
    }
  }
}
