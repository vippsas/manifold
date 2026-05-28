import { vi } from 'vitest'
import type { ChatMessage } from '../../shared/simple-types'
import type { AgentSession } from '../../shared/types'

export function createMockChatAdapter() {
  const listeners = new Map<string, Set<(msg: ChatMessage) => void>>()
  return {
    onMessage: vi.fn((sessionId: string, listener: (msg: ChatMessage) => void) => {
      if (!listeners.has(sessionId)) listeners.set(sessionId, new Set())
      listeners.get(sessionId)!.add(listener)
      return () => {
        listeners.get(sessionId)?.delete(listener)
      }
    }),
    // Helper to simulate a message
    emit(sessionId: string, message: ChatMessage) {
      listeners.get(sessionId)?.forEach((fn) => fn(message))
    },
    _listeners: listeners,
  }
}

export function createMockMemoryStore() {
  return {
    upsertSession: vi.fn(),
    insertInteraction: vi.fn(),
  }
}

export function createMockSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    runtimeId: 'claude',
    branchName: 'manifold/test',
    worktreePath: '/tmp/worktree',
    status: 'running',
    pid: 1234,
    additionalDirs: [],
    ...overrides,
  }
}

export function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'user',
    text: 'Please fix the authentication bug in the login handler',
    timestamp: Date.now(),
    ...overrides,
  }
}
