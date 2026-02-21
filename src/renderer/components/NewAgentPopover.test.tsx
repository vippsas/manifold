import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { NewAgentPopover } from './NewAgentPopover'

const MOCK_RUNTIMES = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'gemini', name: 'Gemini CLI', binary: 'gemini', installed: true },
  { id: 'custom', name: 'Custom', binary: '', installed: true },
]

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
    if (channel === 'branch:suggest') return Promise.resolve('manifold/oslo')
    return Promise.resolve(undefined)
  })
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

function renderPopover(overrides = {}) {
  const defaultProps = {
    visible: true,
    projectId: 'proj-1',
    defaultRuntime: 'claude',
    onLaunch: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  return { ...render(<NewAgentPopover {...defaultProps} />), props: defaultProps }
}

describe('NewAgentPopover', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <NewAgentPopover
        visible={false}
        projectId="proj-1"
        defaultRuntime="claude"
        onLaunch={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog when visible', () => {
    renderPopover()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Launch Agent')).toBeInTheDocument()
  })

  it('fetches branch suggestion on mount', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
      if (channel === 'branch:suggest') return Promise.resolve('manifold/bergen')
      return Promise.resolve(undefined)
    })
    renderPopover()

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('branch:suggest', 'proj-1')
    })
  })

  it('renders runtime select with all options', async () => {
    renderPopover()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()
    })
  })

  it('calls onLaunch with form data when submitted', async () => {
    const { props } = renderPopover()

    const form = screen.getByText('Launch').closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: '',
      }),
    )
  })

  it('calls onClose when Cancel button is clicked', () => {
    const { props } = renderPopover()

    fireEvent.click(screen.getByText('Cancel'))

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when close X button is clicked', () => {
    const { props } = renderPopover()

    // The close button uses &times; which renders as the multiplication sign
    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((btn) => btn.textContent === '\u00D7')
    expect(xButton).toBeDefined()
    fireEvent.click(xButton!)

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    const { props } = renderPopover()

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows "Launching..." text after submit', async () => {
    renderPopover()

    const form = screen.getByText('Launch').closest('form')!
    fireEvent.submit(form)

    expect(screen.getByText('Launching...')).toBeInTheDocument()
  })

  it('uses fallback branch name if suggestion fetch fails', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
      return Promise.reject(new Error('no suggestion'))
    })
    renderPopover()

    await waitFor(() => {
      const branchInput = screen.getByPlaceholderText('manifold/oslo') as HTMLInputElement
      expect(branchInput.value).toBe('manifold/oslo')
    })
  })
})
