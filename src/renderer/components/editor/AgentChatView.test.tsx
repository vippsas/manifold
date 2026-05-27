import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AgentChatView } from './AgentChatView'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'simple:chat-messages') return Promise.resolve([])
    if (channel === 'simple:get-agent-status') return Promise.resolve('waiting')
    return Promise.resolve(undefined)
  })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

describe('AgentChatView', () => {
  it('subscribes to chat messages for the given session', async () => {
    render(<AgentChatView sessionId="sess-1" />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('simple:chat-messages', 'sess-1')
    })
    expect(mockOn).toHaveBeenCalledWith('simple:chat-message', expect.any(Function))
  })

  it('renders the chat input', async () => {
    render(<AgentChatView sessionId="sess-1" />)
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })
})
