import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatAdapter } from './chat-adapter'

describe('ChatAdapter', () => {
  let adapter: ChatAdapter

  beforeEach(() => {
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

  it('processes PTY output into agent messages', () => {
    const listener = vi.fn()
    adapter.onMessage('session-1', listener)
    adapter.processPtyOutput('session-1', 'I have created a basic landing page with a header and hero section.')
    const messages = adapter.getMessages('session-1')
    expect(messages.some(m => m.role === 'agent')).toBe(true)
  })
})
