import type { ChatAdapter } from '../agent/chat-adapter'
import type { ChatMessage } from '../../shared/simple-types'
import type { AgentSession } from '../../shared/types'
import type { ToolUseEvent } from '../../shared/memory-types'
import type { MemoryStore } from './memory-store'
import type { MemoryCompressor } from './memory-compressor'
import { ToolDetector } from './tool-detector'

const MEMORY_CONTEXT_REGEX = /<!-- manifold:memory-context:start -->[\s\S]*?<!-- manifold:memory-context:end -->/g
const INCREMENTAL_COMPRESSION_INTERVAL = 5
const RECENT_USER_INPUT_WINDOW_MS = 15_000

function looksLikeTerminalArtifact(line: string): boolean {
  return /^[-─═_]{3,}$/.test(line)
    || /^(?:[•◦·]\s*)?\d+(?:\s+\d+)+(?:\s*[•◦·]\s*)?$/.test(line)
    || /background terminals? running/i.test(line)
    || /\/ps to view/i.test(line)
    || /\/stop to close/i.test(line)
    || /esc to interrupt/i.test(line)
}

function normalizeEchoText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function looksLikeUserEcho(agentText: string, userText: string): boolean {
  const agentTokens = [...new Set(normalizeEchoText(agentText))]
  const userTokens = [...new Set(normalizeEchoText(userText))]
  if (agentTokens.length === 0 || userTokens.length === 0) return false

  const shorter = agentTokens.length <= userTokens.length ? agentTokens : userTokens
  const longer = new Set(agentTokens.length <= userTokens.length ? userTokens : agentTokens)
  const overlap = shorter.filter((token) => longer.has(token)).length

  return shorter.length >= 4 && overlap / shorter.length >= 0.8
}

export function sanitizeMemoryText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' ').trim())
    .map((line) => line.replace(/^[•◦·]+\s*/, ''))
    .map((line) => line.replace(/\s+[◦·].*(background terminals? running|\/ps to view|\/stop to close|esc to interrupt).*$/i, ''))
    .filter((line) => line.length > 0)
    .filter((line) => !looksLikeTerminalArtifact(line))
    .filter((line) => {
      const collapsed = line.replace(/ /g, '')
      if (/(?:\b\w\b\s+){8,}/.test(line)) return false
      return collapsed.length >= line.length * 0.6 || />|sh:|npm|pnpm|yarn|vitest|tsc/i.test(line)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

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
  private inputBuffers = new Map<string, string>()
  private recentUserInputs = new Map<string, Array<{ text: string; timestamp: number }>>()
  private memoryCompressor: MemoryCompressor | null = null
  private toolDetector = new ToolDetector()

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
    this.inputBuffers.delete(sessionId)
    this.recentUserInputs.delete(sessionId)
  }

  recordInput(sessionId: string, input: string): void {
    const session = this.sessionResolver(sessionId)
    if (!session?.projectId) return

    let buffer = this.inputBuffers.get(sessionId) ?? ''

    for (let i = 0; i < input.length; i++) {
      const char = input[i]

      if (char === '\u001b') {
        const rest = input.slice(i)
        const csiMatch = /^\x1b\[[0-?]*[ -/]*[@-~]/.exec(rest)
        if (csiMatch) {
          i += csiMatch[0].length - 1
          continue
        }
        if (i < input.length - 1) {
          i += 1
        }
        continue
      }

      if (char === '\u007f' || char === '\b') {
        buffer = buffer.slice(0, -1)
        continue
      }

      if (char === '\r' || char === '\n') {
        this.storeInteraction(sessionId, 'user', buffer, Date.now())
        buffer = ''
        continue
      }

      if (char >= ' ') {
        buffer += char
      }
    }

    this.inputBuffers.set(sessionId, buffer)
  }

  private onMessage(sessionId: string, message: ChatMessage): void {
    // Strip memory context markers to prevent feedback loops
    const cleanText = message.text.replace(MEMORY_CONTEXT_REGEX, '').trim()

    // Detect tool use events from agent output
    let toolEvents
    if (message.role === 'agent') {
      const detected = this.toolDetector.detect(cleanText)
      if (detected.length > 0) {
        toolEvents = detected
        // Forward to compressor for richer compression
        if (this.memoryCompressor) {
          this.memoryCompressor.addToolEvents(sessionId, detected)
        }
      }
    }

    this.storeInteraction(sessionId, message.role, cleanText, message.timestamp, toolEvents)
  }

  private storeInteraction(sessionId: string, role: string, text: string, timestamp: number, toolEvents?: ToolUseEvent[]): void {
    const session = this.sessionResolver(sessionId)
    if (!session?.projectId) return

    const cleanText = sanitizeMemoryText(text)
    if (!cleanText || isNoise(cleanText)) return

    if (role === 'agent' && this.isLikelyUserEcho(sessionId, cleanText, timestamp)) {
      return
    }

    this.memoryStore.insertInteraction(
      session.projectId,
      sessionId,
      role,
      cleanText,
      timestamp,
      toolEvents,
    )

    if (role === 'user') {
      const recent = (this.recentUserInputs.get(sessionId) ?? [])
        .filter((entry) => timestamp - entry.timestamp <= RECENT_USER_INPUT_WINDOW_MS)
      recent.push({ text: cleanText, timestamp })
      this.recentUserInputs.set(sessionId, recent.slice(-5))
    }

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

  private isLikelyUserEcho(sessionId: string, text: string, timestamp: number): boolean {
    const recent = this.recentUserInputs.get(sessionId) ?? []
    return recent.some((entry) =>
      timestamp - entry.timestamp <= RECENT_USER_INPUT_WINDOW_MS
      && looksLikeUserEcho(text, entry.text),
    )
  }
}
