import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '../../shared/simple-types'

function makeMessage(role: ChatMessageType['role'], text: string): ChatMessageType {
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

  it('renders generated agent image references as thumbnails', async () => {
    invoke.mockResolvedValue('data:image/png;base64,BBBB')
    render(<ChatMessage message={makeMessage('agent', 'Created image.\n[image: /tmp/generated-car.png]')} />)

    const img = await screen.findByAltText('Pasted attachment')
    const button = screen.getByRole('button', { name: 'Open image attachment' })

    expect(img).toHaveAttribute('src', 'data:image/png;base64,BBBB')
    expect(button).toHaveAttribute('data-file-path', '/tmp/generated-car.png')
    expect(screen.getByText('Created image.')).toBeInTheDocument()
    expect(screen.queryByText(/\[image:/)).not.toBeInTheDocument()
  })

  it('renders project image path lines in agent responses as thumbnails', async () => {
    invoke.mockResolvedValue('data:image/png;base64,DDDD')
    const message = {
      ...makeMessage('agent', 'Created the bike image and saved it here:\n\nassets/bike.png\n\nI inspected the saved file.'),
      sessionId: 'sess-1',
    }

    render(<ChatMessage message={message} />)

    const img = await screen.findByAltText('Pasted attachment')
    const button = screen.getByRole('button', { name: 'Open image attachment' })

    expect(img).toHaveAttribute('src', 'data:image/png;base64,DDDD')
    expect(button).toHaveAttribute('data-file-path', 'assets/bike.png')
    expect(invoke).toHaveBeenCalledWith('chat:read-pasted-image', 'assets/bike.png', 'sess-1')
    expect(screen.getByText('Created the bike image and saved it here:')).toBeInTheDocument()
    expect(screen.getByText('I inspected the saved file.')).toBeInTheDocument()
    expect(screen.queryByText('assets/bike.png')).not.toBeInTheDocument()
  })

  it('renders standalone markdown image links in agent responses as thumbnails', async () => {
    invoke.mockResolvedValue('data:image/png;base64,EEEE')
    const imagePath = '/Users/svenmalvik/.manifold/worktrees/platform-ai/platform-ai-farsund/assets/bike-v2.png'
    const message = {
      ...makeMessage(
        'agent',
        `Created a new bike image and saved it here:\n\n[assets/bike-v2.png](${imagePath})\n\nMode used: built-in image generation tool.`,
      ),
      sessionId: 'sess-1',
    }

    render(<ChatMessage message={message} />)

    const img = await screen.findByAltText('Pasted attachment')
    const button = screen.getByRole('button', { name: 'Open image attachment' })

    expect(img).toHaveAttribute('src', 'data:image/png;base64,EEEE')
    expect(button).toHaveAttribute('data-file-path', imagePath)
    expect(invoke).toHaveBeenCalledWith('chat:read-pasted-image', imagePath, 'sess-1')
    expect(screen.getByText('Created a new bike image and saved it here:')).toBeInTheDocument()
    expect(screen.getByText('Mode used: built-in image generation tool.')).toBeInTheDocument()
    expect(screen.queryByText('assets/bike-v2.png')).not.toBeInTheDocument()
  })

  it('leaves inline project image paths in agent prose as text', () => {
    render(<ChatMessage message={makeMessage('agent', 'Created the image at assets/bike.png.')} />)

    expect(screen.getByText('Created the image at assets/bike.png.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('passes the chat session id when loading generated image thumbnails', async () => {
    invoke.mockResolvedValue('data:image/png;base64,BBBB')
    const message = { ...makeMessage('agent', '[image: /repo/public/generated-images/bike.png]'), sessionId: 'sess-1' }

    render(<ChatMessage message={message} />)

    await screen.findByAltText('Pasted attachment')
    expect(invoke).toHaveBeenCalledWith('chat:read-pasted-image', '/repo/public/generated-images/bike.png', 'sess-1')
  })

  it('opens a high-resolution viewer with the underlying path', async () => {
    invoke.mockResolvedValue('data:image/png;base64,CCCC')
    render(<ChatMessage message={makeMessage('agent', '[image: /tmp/render.png]')} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open image attachment' }))

    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()
    expect(screen.getByAltText('Full resolution attachment')).toHaveAttribute('src', 'data:image/png;base64,CCCC')
    expect(screen.getByText('/tmp/render.png')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }))
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
  })

  it('falls back to the reference text when the image cannot be loaded', async () => {
    invoke.mockRejectedValue(new Error('not found'))
    render(<ChatMessage message={makeMessage('user', '[image: /tmp/missing.png]')} />)

    await waitFor(() => {
      expect(screen.getByText('[image: /tmp/missing.png]')).toBeInTheDocument()
    })
  })

  it('falls back to the reference text when the image loader returns no data', async () => {
    invoke.mockResolvedValue(undefined)
    render(<ChatMessage message={makeMessage('user', '[image: /tmp/missing.png]')} />)

    await waitFor(() => {
      expect(screen.getByText('[image: /tmp/missing.png]')).toBeInTheDocument()
    })
  })

  it('leaves placeholder image markers as text', () => {
    render(<ChatMessage message={makeMessage('agent', 'Use [image: PATH] for attachments.')} />)

    expect(screen.getByText('Use [image: PATH] for attachments.')).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })
})
