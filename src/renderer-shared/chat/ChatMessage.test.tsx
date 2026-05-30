import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'

function makeMessage(role: 'user' | 'assistant', text: string): ChatMessageType {
  return { id: 'msg-1', role, text } as ChatMessageType
}

const invoke = vi.fn()

beforeEach(() => {
  invoke.mockReset()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ChatMessage image references', () => {
  it('renders a [image: PATH] reference as a thumbnail instead of raw text', async () => {
    invoke.mockResolvedValue('data:image/png;base64,AAAA')
    render(<ChatMessage message={makeMessage('user', '[image: /tmp/paste-1.png]\nplease look at this')} />)

    const img = await screen.findByAltText('Pasted attachment')
    expect(img).toHaveAttribute('src', 'data:image/png;base64,AAAA')
    expect(invoke).toHaveBeenCalledWith('chat:read-pasted-image', '/tmp/paste-1.png')
    expect(screen.getByText('please look at this')).toBeInTheDocument()
    expect(screen.queryByText(/\[image:/)).not.toBeInTheDocument()
  })

  it('falls back to the reference text when the image cannot be loaded', async () => {
    invoke.mockRejectedValue(new Error('not found'))
    render(<ChatMessage message={makeMessage('user', '[image: /tmp/missing.png]')} />)

    await waitFor(() => {
      expect(screen.getByText('[image: /tmp/missing.png]')).toBeInTheDocument()
    })
  })

  it('leaves assistant messages untouched', () => {
    render(<ChatMessage message={makeMessage('assistant', '[image: /tmp/x.png] stays literal')} />)
    expect(screen.getByText('[image: /tmp/x.png] stays literal')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })
})
