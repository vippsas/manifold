import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react'
import React from 'react'
import { NewTaskModal } from './NewTaskModal'

const MOCK_RUNTIMES = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'gemini', name: 'Gemini', binary: 'gemini', installed: true },
  { id: 'custom', name: 'Custom', binary: '', installed: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
      return Promise.resolve(undefined)
    }),
    on: vi.fn(() => vi.fn()),
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

function renderModal(overrides = {}) {
  const defaultProps = {
    visible: true,
    projectId: 'proj-1',
    projectName: 'my-app',
    defaultRuntime: 'claude',
    onLaunch: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  return { ...render(<NewTaskModal {...defaultProps} />), props: defaultProps }
}

describe('NewTaskModal', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(
      <NewTaskModal
        visible={false}
        projectId="proj-1"
        projectName="my-app"
        defaultRuntime="claude"
        onLaunch={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders dialog when visible with "New Task" title', () => {
    renderModal()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Task')).toBeInTheDocument()
  })

  it('renders a textarea', () => {
    renderModal()

    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
    expect(textarea.tagName).toBe('TEXTAREA')
  })

  it('"Start Task" button is disabled when textarea is empty', () => {
    renderModal()

    const submitButton = screen.getByRole('button', { name: /start task/i })
    expect(submitButton).toBeDisabled()
  })

  it('"Start Task" button is enabled when textarea has content', () => {
    renderModal()

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Fix the login bug' } })

    const submitButton = screen.getByRole('button', { name: /start task/i })
    expect(submitButton).toBeEnabled()
  })

  it('calls onLaunch with task description as prompt on submit', () => {
    const { props } = renderModal()

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Fix the login bug' } })

    const form = screen.getByRole('button', { name: /start task/i }).closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'Fix the login bug',
      }),
    )
  })

  it('shows "Starting..." after submit', () => {
    renderModal()

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Fix the login bug' } })

    const form = screen.getByRole('button', { name: /start task/i }).closest('form')!
    fireEvent.submit(form)

    expect(screen.getByText('Starting\u2026')).toBeInTheDocument()
  })

  it('calls onClose on Escape key', () => {
    const { props } = renderModal()

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose on Cancel click', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByText('Cancel'))

    expect(props.onClose).toHaveBeenCalled()
  })

  it('agent dropdown shows all runtime options', async () => {
    renderModal()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()
    })

    // Verify all runtime options exist
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('Gemini')).toBeInTheDocument()
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('Advanced section toggles on click', () => {
    renderModal()

    // Branch input should not be visible initially
    expect(screen.queryByPlaceholderText('my-app/...')).not.toBeInTheDocument()

    // Click "Advanced" to expand
    fireEvent.click(screen.getByText('Advanced'))

    // Branch input should now be visible
    expect(screen.getByPlaceholderText('my-app/...')).toBeInTheDocument()
  })

  it('Branch field is visible when Advanced is open', () => {
    renderModal()

    fireEvent.click(screen.getByText('Advanced'))

    const branchInput = screen.getByPlaceholderText('my-app/...')
    expect(branchInput).toBeInTheDocument()
    expect(branchInput.tagName).toBe('INPUT')
  })

  it('calls onClose when close X button is clicked', () => {
    const { props } = renderModal()

    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((btn) => btn.textContent === '\u00D7')
    expect(xButton).toBeDefined()
    fireEvent.click(xButton!)

    expect(props.onClose).toHaveBeenCalled()
  })

  it('does not submit when textarea is empty', () => {
    const { props } = renderModal()

    const form = screen.getByRole('button', { name: /start task/i }).closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('derives branch name from task description with debounce', () => {
    vi.useFakeTimers()
    renderModal()

    // Open advanced to see branch input
    fireEvent.click(screen.getByText('Advanced'))

    // After opening Advanced, there are two textbox roles (textarea + branch input)
    // so we target the textarea element directly
    const textarea = document.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'Fix the login bug' } })

    // Branch should not be updated yet (debounce)
    const branchInput = screen.getByPlaceholderText('my-app/...') as HTMLInputElement
    expect(branchInput.value).toBe('')

    // Advance past the 300ms debounce, wrapped in act for React state updates
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(branchInput.value).toBe('my-app/fix-login-bug')

    vi.useRealTimers()
  })

  it('uses selected runtime in the launch options', async () => {
    const { props } = renderModal()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()
    })
    const select = screen.getByDisplayValue('Claude Code')
    fireEvent.change(select, { target: { value: 'gemini' } })

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Build a feature' } })

    const form = screen.getByRole('button', { name: /start task/i }).closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'gemini',
      }),
    )
  })
})
