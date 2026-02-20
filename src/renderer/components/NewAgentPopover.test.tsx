import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { NewAgentPopover } from './NewAgentPopover'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
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
        onLaunch={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders the dialog when visible', () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
    renderPopover()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Launch Agent')).toBeInTheDocument()
  })

  it('fetches branch suggestion on mount', async () => {
    mockInvoke.mockResolvedValue('manifold/bergen')
    renderPopover()

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('branch:suggest', 'proj-1')
    })
  })

  it('renders runtime select with all options', () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
    renderPopover()

    const select = screen.getByDisplayValue('Claude Code')
    expect(select).toBeInTheDocument()
  })

  it('calls onLaunch with form data when submitted', async () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
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
    mockInvoke.mockResolvedValue('manifold/oslo')
    const { props } = renderPopover()

    fireEvent.click(screen.getByText('Cancel'))

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when close X button is clicked', () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
    const { props } = renderPopover()

    // The close button uses &times; which renders as the multiplication sign
    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((btn) => btn.textContent === '\u00D7')
    expect(xButton).toBeDefined()
    fireEvent.click(xButton!)

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
    const { props } = renderPopover()

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('shows "Launching..." text after submit', async () => {
    mockInvoke.mockResolvedValue('manifold/oslo')
    renderPopover()

    const form = screen.getByText('Launch').closest('form')!
    fireEvent.submit(form)

    expect(screen.getByText('Launching...')).toBeInTheDocument()
  })

  it('uses fallback branch name if suggestion fetch fails', async () => {
    mockInvoke.mockRejectedValue(new Error('no suggestion'))
    renderPopover()

    await waitFor(() => {
      const branchInput = screen.getByPlaceholderText('manifold/oslo') as HTMLInputElement
      expect(branchInput.value).toBe('manifold/oslo')
    })
  })
})
