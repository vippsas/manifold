import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryCapture } from './memory-capture'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { AgentSession } from '../../shared/types'
import type { MemoryStore } from './memory-store'
import {
  createMockChatAdapter,
  createMockMemoryStore,
  createMockSession,
  makeMessage,
} from './memory-capture.test-helpers'

describe('MemoryCapture — capture lifecycle', () => {
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
        '/tmp/worktree',
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
        '/tmp/worktree',
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
        undefined,
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
        undefined,
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
        undefined,
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
        undefined,
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
        undefined,
      )
    })
  })

})
