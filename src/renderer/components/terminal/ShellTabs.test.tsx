import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithStrictMode } from '../../test-utils/strict-mode.test-helpers'
import { resetShellTerminalStore } from './shell-terminal-store'
import { getShellHeaderControls } from './shell-header-controls'
import { ShellTabs } from './ShellTabs'

vi.mock('../../hooks/terminal/useTerminal', () => ({
  useTerminal: () => ({ containerRef: { current: null } }),
}))

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  resetShellTerminalStore()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell:create') return Promise.resolve({ sessionId: 'shell-1' })
    if (channel === 'shell-tabs:get') return Promise.resolve(null)
    return Promise.resolve(undefined)
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => () => {}),
  }
})

describe('ShellTabs', () => {
  it('opens a terminal with no agent session', async () => {
    render(<ShellTabs cwd="/worktrees/checkout" scrollbackLines={1000} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/worktrees/checkout', { mode: 'manifold' }))
  })

  it('creates exactly one terminal under StrictMode', async () => {
    renderWithStrictMode(<ShellTabs cwd="/worktrees/checkout" scrollbackLines={1000} />)
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('shell:create', expect.anything(), expect.anything()))
    expect(mockInvoke.mock.calls.filter((c) => c[0] === 'shell:create')).toHaveLength(1)
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', expect.anything())
  })

  it('shows the empty state and no shell:create when no workspace resolves', () => {
    render(<ShellTabs cwd={null} scrollbackLines={1000} />)
    expect(screen.getByText(/select a workspace/i)).toBeInTheDocument()
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:create', expect.anything(), expect.anything())
  })

  it('lists the terminals beside them', async () => {
    let n = 0
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') {
        return Promise.resolve({
          tabs: [{ label: 'Manifold 1', cwd: '/a', mode: 'manifold' },
                 { label: 'System 2', cwd: '/a', mode: 'system' }],
          counter: 3,
        })
      }
      if (channel === 'shell:create') return Promise.resolve({ sessionId: `s${++n}` })
      return Promise.resolve(undefined)
    })
    render(<ShellTabs cwd="/a" scrollbackLines={1000} />)

    const list = await screen.findByLabelText('Terminals')
    expect(within(list).getByRole('button', { name: 'Manifold 1' })).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'System 2' })).toBeInTheDocument()
  })

  it('lists a single terminal too, so the list never appears from nowhere', async () => {
    render(<ShellTabs cwd="/solo" scrollbackLines={1000} />)
    const list = await screen.findByLabelText('Terminals')
    expect(within(list).getByRole('button', { name: 'Manifold 1' })).toBeInTheDocument()
  })

  it('kills a terminal from its row in the list', async () => {
    render(<ShellTabs cwd="/solo" scrollbackLines={1000} />)
    const list = await screen.findByLabelText('Terminals')
    fireEvent.click(within(list).getByRole('button', { name: 'Kill Manifold 1' }))
    expect(mockInvoke).toHaveBeenCalledWith('shell:kill', 'shell-1')
  })

  it('hides the whole terminal view through the header control without killing', async () => {
    const onHide = vi.fn()
    render(<ShellTabs cwd="/solo" scrollbackLines={1000} onHide={onHide} />)
    await screen.findByLabelText('Terminals')
    getShellHeaderControls()?.onHideTerminals()
    expect(onHide).toHaveBeenCalledTimes(1)
    expect(mockInvoke).not.toHaveBeenCalledWith('shell:kill', expect.anything())
  })

  it('surfaces a failed open in the error strip', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'shell-tabs:get') return Promise.resolve(null)
      if (channel === 'shell:create') return Promise.reject(new Error('spawn failed'))
      return Promise.resolve(undefined)
    })
    render(<ShellTabs cwd="/gone" scrollbackLines={1000} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('spawn failed')
  })
})
