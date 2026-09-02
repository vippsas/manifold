import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AgentChatView } from './AgentChatView'

const mockInvoke = vi.fn()
// Recorded file-wide and never cleared: the Viola run store attaches its IPC listener once per
// module instance, so whichever test renders first is the one that registers it.
const ipcHandlers = new Map<string, (payload: unknown) => void>()
const mockOn = vi.fn((channel: string, cb: (payload: unknown) => void) => {
  ipcHandlers.set(channel, cb)
  return vi.fn()
})

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

  it('renders the starfield backdrop behind the empty state', async () => {
    render(<AgentChatView sessionId="sess-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('starfield-backdrop')).toBeInTheDocument()
    })
  })

  it('renders Viola as a goal-oriented normal chat surface', async () => {
    render(<AgentChatView sessionId="viola-1" runtimeId="viola" />)

    expect(await screen.findByText('Give Viola a goal')).toBeInTheDocument()
    expect(screen.getByText('Viola proposes a plan before starting workers')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('shows the live Viola run board in place of the generic thinking phrases', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'simple:chat-messages') return Promise.resolve([])
      if (channel === 'simple:get-agent-status') return Promise.resolve('running')
      return Promise.resolve(undefined)
    })

    render(<AgentChatView sessionId="viola-1" runtimeId="viola" />)
    await waitFor(() => expect(ipcHandlers.has('viola:run')).toBe(true))

    act(() => {
      ipcHandlers.get('viola:run')!({
        sessionId: 'viola-1',
        run: {
          id: 'viola-1', baseSessionId: 'viola-1', goal: 'g', summary: 's', state: 'running',
          availableRuntimes: ['claude', 'codex'], createdAt: Date.now(),
          tasks: [{
            id: 'api', title: 'API tests', description: 'd', acceptance: ['a'],
            purpose: 'implement', gates: [], state: 'implementing',
            stateSince: Date.now(), runtimeId: 'claude', sessionId: 'child-1',
          }],
        },
      })
    })

    expect(await screen.findByText('API tests')).toBeInTheDocument()
    expect(screen.getByText('implementing')).toBeInTheDocument()
    expect(screen.queryByTestId('thinking-phrase')).not.toBeInTheDocument()
  })

  it('keeps a thinking indicator while Viola is still planning and has no live run', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'simple:chat-messages') {
        return Promise.resolve([{ id: 'm1', sessionId: 'viola-2', role: 'user', text: 'Add validation', timestamp: 1 }])
      }
      if (channel === 'simple:get-agent-status') return Promise.resolve('running')
      return Promise.resolve(undefined)
    })

    render(<AgentChatView sessionId="viola-2" runtimeId="viola" />)

    // Planning can take minutes; an empty board would look like nothing is happening at all.
    expect(await screen.findByTestId('thinking-phrase')).toBeInTheDocument()
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
