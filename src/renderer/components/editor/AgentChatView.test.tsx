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

  it('renders image references from existing non-interactive chat messages', async () => {
    const imagePath = '/var/folders/wl/app/T/manifold-chat-images/sess-1/image.png'
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'simple:chat-messages') {
        return Promise.resolve([
          {
            id: 'msg-1',
            sessionId: 'sess-1',
            role: 'user',
            text: `[image: ${imagePath}]`,
            timestamp: 1,
          },
        ])
      }
      if (channel === 'chat:read-pasted-image') return Promise.resolve('data:image/png;base64,AAAA')
      if (channel === 'simple:get-agent-status') return Promise.resolve('waiting')
      return Promise.resolve(undefined)
    })

    render(<AgentChatView sessionId="sess-1" />)

    const image = await screen.findByAltText('Pasted attachment')
    expect(image).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(mockInvoke).toHaveBeenCalledWith('chat:read-pasted-image', imagePath, 'sess-1')
    expect(screen.queryByText(/\[image:/)).not.toBeInTheDocument()
  })

  it('renders markdown image links from existing non-interactive agent responses', async () => {
    const imagePath = '/Users/svenmalvik/.manifold/worktrees/platform-ai/platform-ai-farsund/assets/bike-v2.png'
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'simple:chat-messages') {
        return Promise.resolve([
          {
            id: 'msg-1',
            sessionId: 'sess-1',
            role: 'agent',
            text: `Created a new bike image and saved it here:\n\n[assets/bike-v2.png](${imagePath})`,
            timestamp: 1,
          },
        ])
      }
      if (channel === 'chat:read-pasted-image') return Promise.resolve('data:image/png;base64,BBBB')
      if (channel === 'simple:get-agent-status') return Promise.resolve('waiting')
      return Promise.resolve(undefined)
    })

    render(<AgentChatView sessionId="sess-1" />)

    const image = await screen.findByAltText('Pasted attachment')
    expect(image).toHaveAttribute('src', 'data:image/png;base64,BBBB')
    expect(mockInvoke).toHaveBeenCalledWith('chat:read-pasted-image', imagePath, 'sess-1')
    expect(screen.queryByText('assets/bike-v2.png')).not.toBeInTheDocument()
  })
})
