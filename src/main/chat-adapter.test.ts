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

  it('strips basic ANSI color sequences', () => {
    adapter.processPtyOutput('session-1', '\x1b[32mHello\x1b[0m \x1b[1mworld\x1b[0m')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world')
  })

  it('strips CSI ? sequences', () => {
    adapter.processPtyOutput('session-1', '\x1b[?2026h\x1b[?2004hHello world\x1b[?25l')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world')
  })

  it('strips 256-color sequences even when split across chunks', () => {
    // ESC[38;5;246m split as two chunks
    adapter.processPtyOutput('session-1', '\x1b[38;5;2')
    adapter.processPtyOutput('session-1', '46mHello world\x1b[0m')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world')
  })

  it('strips orphaned CSI fragments like [38;5;246m', () => {
    // Raw text with orphaned fragment (no ESC prefix)
    adapter.processPtyOutput('session-1', 'Hello [38;5;246mworld')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world')
  })

  it('replaces cursor-movement sequences with spaces to preserve word boundaries', () => {
    // Simulate TUI output using CHA (G) and CUF (C) for positioning
    adapter.processPtyOutput('session-1', 'Hello\x1b[10Gworld\x1b[3Ctest')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Hello world test')
  })

  it('replaces cursor position (H) sequences with spaces', () => {
    adapter.processPtyOutput('session-1', 'Quick\x1b[1;7Hsafety\x1b[1;14Hcheck')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages).toHaveLength(1)
    expect(messages[0].text).toBe('Quick safety check')
  })

  it('ignores empty output after stripping', () => {
    adapter.processPtyOutput('session-1', '\x1b[?25l\x1b[?2004h')
    vi.advanceTimersByTime(300)
    expect(adapter.getMessages('session-1')).toHaveLength(0)
  })

  it('normalizes excessive whitespace', () => {
    adapter.processPtyOutput('session-1', 'Hello     world    test')
    vi.advanceTimersByTime(300)

    const messages = adapter.getMessages('session-1')
    expect(messages[0].text).toBe('Hello world test')
  })
})
