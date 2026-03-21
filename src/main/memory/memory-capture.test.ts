import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryCapture, sanitizeMemoryText } from './memory-capture'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { ChatMessage } from '../../shared/simple-types'
import type { AgentSession } from '../../shared/types'
import type { MemoryStore } from './memory-store'

function createMockChatAdapter() {
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

function createMockMemoryStore() {
  return {
    upsertSession: vi.fn(),
    insertInteraction: vi.fn(),
  }
}

function createMockSession(overrides: Partial<AgentSession> = {}): AgentSession {
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

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    sessionId: 'sess-1',
    role: 'user',
    text: 'Please fix the authentication bug in the login handler',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('MemoryCapture', () => {
  let adapter: ReturnType<typeof createMockChatAdapter>
  let store: ReturnType<typeof createMockMemoryStore>
  let sessions: Map<string, AgentSession>
  let capture: MemoryCapture

  beforeEach(() => {
    adapter = createMockChatAdapter()
    store = createMockMemoryStore()
    sessions = new Map()
    sessions.set('sess-1', createMockSession())

    capture = new MemoryCapture(
      adapter as unknown as ChatAdapter,
      store as unknown as MemoryStore,
      (id) => sessions.get(id),
    )
  })

  describe('startCapturing', () => {
    it('registers a listener on the chat adapter', () => {
      capture.startCapturing('sess-1')
      expect(adapter.onMessage).toHaveBeenCalledWith('sess-1', expect.any(Function))
    })

    it('calls upsertSession with session metadata', () => {
      capture.startCapturing('sess-1')
      expect(store.upsertSession).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'claude',
        'manifold/test',
        undefined,
      )
    })

    it('calls upsertSession with taskDescription when available', () => {
      sessions.set('sess-1', createMockSession({ taskDescription: 'fix bug' }))
      capture.startCapturing('sess-1')
      expect(store.upsertSession).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'claude',
        'manifold/test',
        'fix bug',
      )
    })

    it('does not double-subscribe', () => {
      capture.startCapturing('sess-1')
      capture.startCapturing('sess-1')
      expect(adapter.onMessage).toHaveBeenCalledTimes(1)
    })
  })

  describe('stopCapturing', () => {
    it('unsubscribes the listener', () => {
      capture.startCapturing('sess-1')
      expect(adapter._listeners.get('sess-1')?.size).toBe(1)

      capture.stopCapturing('sess-1')
      expect(adapter._listeners.get('sess-1')?.size).toBe(0)
    })

    it('is a no-op for unknown sessions', () => {
      // Should not throw
      capture.stopCapturing('unknown')
    })
  })

  describe('message capture', () => {
    it('stores messages via memoryStore', () => {
      capture.startCapturing('sess-1')
      const msg = makeMessage()
      adapter.emit('sess-1', msg)

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'Please fix the authentication bug in the login handler',
        msg.timestamp,
      )
    })

    it('stores agent messages', () => {
      capture.startCapturing('sess-1')
      const msg = makeMessage({ role: 'agent', text: 'I can help with that authentication issue in the handler' })
      adapter.emit('sess-1', msg)

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'agent',
        'I can help with that authentication issue in the handler',
        msg.timestamp,
      )
    })

    it('captures terminal user input when a line is submitted', () => {
      capture.startCapturing('sess-1')

      capture.recordInput('sess-1', 'Please commit, push, and open a PR')
      expect(store.insertInteraction).not.toHaveBeenCalled()

      capture.recordInput('sess-1', '\r')
      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'Please commit, push, and open a PR',
        expect.any(Number),
      )
    })

    it('handles backspace while capturing terminal user input', () => {
      capture.startCapturing('sess-1')

      capture.recordInput('sess-1', 'Please fix the codx')
      capture.recordInput('sess-1', '\b')
      capture.recordInput('sess-1', 'ex bug in memory\r')

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'Please fix the codex bug in memory',
        expect.any(Number),
      )
    })

    it('suppresses echoed agent output when it matches a recent user prompt', () => {
      capture.startCapturing('sess-1')

      capture.recordInput('sess-1', 'Please commit push and create a PR\r')
      adapter.emit('sess-1', makeMessage({
        role: 'agent',
        text: 'Please commit, push, and create a PR',
      }))

      expect(store.insertInteraction).toHaveBeenCalledTimes(1)
      expect(store.insertInteraction).toHaveBeenLastCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'Please commit push and create a PR',
        expect.any(Number),
      )
    })
  })

  describe('shell session skipping', () => {
    it('skips messages from sessions without a projectId', () => {
      sessions.set('shell-1', createMockSession({ id: 'shell-1', projectId: '' }))
      capture.startCapturing('shell-1')
      adapter.emit('shell-1', makeMessage({ sessionId: 'shell-1' }))

      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('skips messages from sessions not found in resolver', () => {
      // Force the adapter to accept the subscription even though session doesn't exist
      capture = new MemoryCapture(
        adapter as unknown as ChatAdapter,
        store as unknown as MemoryStore,
        () => undefined,
      )
      capture.startCapturing('ghost')
      adapter.emit('ghost', makeMessage({ sessionId: 'ghost' }))

      expect(store.insertInteraction).not.toHaveBeenCalled()
    })
  })

  describe('memory context marker stripping', () => {
    it('strips manifold memory context markers', () => {
      capture.startCapturing('sess-1')
      const text =
        'The authentication handler needs to validate tokens ' +
        '<!-- manifold:memory-context:start -->secret memory stuff<!-- manifold:memory-context:end -->' +
        ' before processing the request'
      adapter.emit('sess-1', makeMessage({ text }))

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'The authentication handler needs to validate tokens  before processing the request',
        expect.any(Number),
      )
    })

    it('strips multiple memory context blocks', () => {
      capture.startCapturing('sess-1')
      const text =
        '<!-- manifold:memory-context:start -->block1<!-- manifold:memory-context:end -->' +
        'The refactored session manager now handles reconnections properly' +
        '<!-- manifold:memory-context:start -->block2<!-- manifold:memory-context:end -->'
      adapter.emit('sess-1', makeMessage({ text }))

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'The refactored session manager now handles reconnections properly',
        expect.any(Number),
      )
    })

    it('does not store empty messages after stripping', () => {
      capture.startCapturing('sess-1')
      const text =
        '<!-- manifold:memory-context:start -->only context<!-- manifold:memory-context:end -->'
      adapter.emit('sess-1', makeMessage({ text }))

      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('stores messages without markers unchanged', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: 'This message has no markers and should pass through unchanged' }))

      expect(store.insertInteraction).toHaveBeenCalledWith(
        'proj-1',
        'sess-1',
        'user',
        'This message has no markers and should pass through unchanged',
        expect.any(Number),
      )
    })
  })

  describe('noise filtering', () => {
    it('filters out short messages', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: 'short' }))
      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('filters out CLI status bars', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: '› Explain this codebase gpt-5.4 xhigh · 100% left · ~/.manifold/worktrees/project' }))
      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('filters out banner dividers', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: '─────────────────────────────' }))
      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('filters out low-alphanumeric content', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: '│  ┌──┐ ┌──┐ ┌──┐ │  ├──┤ ├──┤ ├──┤' }))
      expect(store.insertInteraction).not.toHaveBeenCalled()
    })

    it('passes through meaningful messages', () => {
      capture.startCapturing('sess-1')
      adapter.emit('sess-1', makeMessage({ text: 'Refactoring the session manager to support reconnections' }))
      expect(store.insertInteraction).toHaveBeenCalled()
    })

    it('sanitizes terminal artifacts out of mixed PTY output', () => {
      expect(sanitizeMemoryText(
        '• 9 10 ◦\n' +
        '─────────────────────────────\n' +
        '• The patch is in. I am running a focused test.\n' +
        '◦ · 2 background terminals running · /ps to view · /stop to close',
      )).toBe('The patch is in. I am running a focused test.')
    })
  })
})
