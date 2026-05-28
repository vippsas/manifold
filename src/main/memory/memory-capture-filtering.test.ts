import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryCapture, sanitizeMemoryText } from './memory-capture'
import type { ChatAdapter } from '../agent/chat-adapter'
import type { AgentSession } from '../../shared/types'
import type { MemoryStore } from './memory-store'
import {
  createMockChatAdapter,
  createMockMemoryStore,
  createMockSession,
  makeMessage,
} from './memory-capture.test-helpers'

describe('MemoryCapture — filtering & stripping', () => {
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
        undefined,
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
        undefined,
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
        undefined,
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
