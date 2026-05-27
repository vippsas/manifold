import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChat } from './useChat'

let onListeners: Array<(msg: unknown) => void> = []
let resolveHydration: ((msgs: unknown[]) => void) | null = null

beforeEach(() => {
  onListeners = []
  resolveHydration = null
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn((channel: string) => {
      if (channel === 'simple:chat-messages') {
        return new Promise((resolve) => {
          resolveHydration = resolve
        })
      }
      return Promise.resolve(undefined)
    }),
    on: vi.fn((channel: string, cb: (msg: unknown) => void) => {
      if (channel === 'simple:chat-message') onListeners.push(cb)
      return () => {}
    }),
  }
})

describe('useChat', () => {
  it('preserves assistant messages that arrive before hydration resolves', async () => {
    const { result } = renderHook(() => useChat('sess-1'))

    // Simulate an assistant message arriving via the listener before hydration completes.
    act(() => {
      onListeners.forEach((cb) =>
        cb({
          id: 'msg-agent-1',
          sessionId: 'sess-1',
          role: 'agent',
          text: 'hi there',
          timestamp: 100,
        }),
      )
    })
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: 'msg-agent-1', role: 'agent' }),
    ])

    // Now hydration resolves with the user message (chronologically earlier).
    await act(async () => {
      resolveHydration!([
        { id: 'msg-user-1', sessionId: 'sess-1', role: 'user', text: 'hello', timestamp: 50 },
      ])
    })

    // Both messages should be present, in chronological order.
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-user-1', 'msg-agent-1'])
  })

  it('resets messages when sessionId changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useChat(id), {
      initialProps: { id: 'sess-1' as string | null },
    })

    await act(async () => {
      resolveHydration?.([
        { id: 'msg-1', sessionId: 'sess-1', role: 'user', text: 'a', timestamp: 1 },
      ])
    })
    expect(result.current.messages).toHaveLength(1)

    rerender({ id: 'sess-2' })
    expect(result.current.messages).toEqual([])
  })

  it('does not duplicate an assistant message delivered by both listener and hydration', async () => {
    const { result } = renderHook(() => useChat('sess-1'))

    // Listener delivers the assistant message first.
    act(() => {
      onListeners.forEach((cb) =>
        cb({
          id: 'msg-agent-1',
          sessionId: 'sess-1',
          role: 'agent',
          text: 'response',
          timestamp: 100,
        }),
      )
    })

    // Hydration resolves with both messages, including the same assistant message.
    await act(async () => {
      resolveHydration!([
        { id: 'msg-user-1', sessionId: 'sess-1', role: 'user', text: 'hello', timestamp: 50 },
        { id: 'msg-agent-1', sessionId: 'sess-1', role: 'agent', text: 'response', timestamp: 100 },
      ])
    })

    // Should have exactly 2 messages, not 3.
    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-user-1', 'msg-agent-1'])
  })
})
