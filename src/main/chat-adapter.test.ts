import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatAdapter } from './chat-adapter'

describe('ChatAdapter', () => {
  let adapter: ChatAdapter

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = new ChatAdapter()
  })

  it('stores a user message', () => {
    adapter.addUserMessage('session-1', 'Build me a landing page')
    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
    expect(messages[0].text).toBe('Build me a landing page')
    expect(messages[0].sessionId).toBe('session-1')
  })

  it('stores a system message', () => {
    adapter.addSystemMessage('session-1', 'Setting up your project...')
    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('system')
  })

  it('returns empty array for unknown session', () => {
    expect(adapter.getMessages('unknown')).toEqual([])
  })

  it('notifies listeners when a message is added', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)
    adapter.addUserMessage('session-1', 'hello')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
  })

  it('buffers PTY output and flushes after 300ms', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)

    adapter.processPtyOutput('session-1', 'Hello ')
    adapter.processPtyOutput('session-1', 'world')

    // Not flushed yet
    expect(adapter.getMessages('session-1')).toHaveLength(0)

    vi.advanceTimersByTime(300)

    // Now flushed as a single message
    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('agent')
    expect(messages[0].text).toContain('Hello')
    expect(messages[0].text).toContain('world')
  })

  it('strips ANSI escape sequences including CSI ? variants', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)

    adapter.processPtyOutput('session-1', '\x1b[?2026h\x1b[?2004hHello world\x1b[0m')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world')
  })

  it('ignores empty output after stripping', () => {
    adapter.processPtyOutput('session-1', '\x1b[?25l\x1b[?2004h')
    vi.advanceTimersByTime(300)
    expect(adapter.getMessages('session-1')).toHaveLength(0)
  })
})
