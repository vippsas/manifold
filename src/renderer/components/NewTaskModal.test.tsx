import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { NewTaskModal } from './NewTaskModal'

const MOCK_RUNTIMES = [
  { id: 'claude', name: 'Claude Code', binary: 'claude', installed: true },
  { id: 'codex', name: 'Codex', binary: 'codex', installed: true },
  { id: 'gemini', name: 'Gemini', binary: 'gemini', installed: true },
]

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn((channel: string) => {
      if (channel === 'runtimes:list') return Promise.resolve(MOCK_RUNTIMES)
      if (channel === 'git:list-branches') return Promise.resolve([])
      if (channel === 'git:list-prs') return Promise.resolve([])
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
    baseBranch: 'main',
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
        baseBranch="main"
        defaultRuntime="claude"
        onLaunch={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders dialog when visible with "New Agent" title', () => {
    renderModal()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Agent')).toBeInTheDocument()
  })

  it('renders a text input', () => {
    renderModal()

    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input.tagName).toBe('INPUT')
  })

  it('"Start Task" button is disabled when input is empty', () => {
    renderModal()

    const submitButton = screen.getByRole('button', { name: /start agent/i })
    expect(submitButton).toBeDisabled()
  })

  it('"Start Task" button is enabled when input has content', () => {
    renderModal()

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Fix the login bug' } })

    const submitButton = screen.getByRole('button', { name: /start agent/i })
    expect(submitButton).toBeEnabled()
  })

  it('calls onLaunch with task description as prompt on submit', () => {
    const { props } = renderModal()

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Fix the login bug' } })

    const form = screen.getByRole('button', { name: /start agent/i }).closest('form')!
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

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Fix the login bug' } })

    const form = screen.getByRole('button', { name: /start agent/i }).closest('form')!
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

    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('Gemini')).toBeInTheDocument()
  })

  it('calls onClose when close X button is clicked', () => {
    const { props } = renderModal()

    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((btn) => btn.textContent === '\u00D7')
    expect(xButton).toBeDefined()
    fireEvent.click(xButton!)

    expect(props.onClose).toHaveBeenCalled()
  })

  it('does not submit when input is empty', () => {
    const { props } = renderModal()

    const form = screen.getByRole('button', { name: /start agent/i }).closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).not.toHaveBeenCalled()
  })

  it('uses selected runtime in the launch options', async () => {
    const { props } = renderModal()

    await waitFor(() => {
      expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()
    })
    const select = screen.getByDisplayValue('Claude Code')
    fireEvent.change(select, { target: { value: 'gemini' } })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Build a feature' } })

    const form = screen.getByRole('button', { name: /start agent/i }).closest('form')!
    fireEvent.submit(form)

    expect(props.onLaunch).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: 'gemini',
      }),
    )
  })

  it('pre-populates task description from initialDescription', () => {
    renderModal({ initialDescription: 'Fix the login bug' })

    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('Fix the login bug')
  })

  it('shows existing branch/PR checkbox unchecked by default', () => {
    renderModal()

    const checkbox = screen.getByRole('checkbox', { name: /existing branch or pr/i })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).not.toBeChecked()
  })

  it('shows Branch/PR sub-tabs when checkbox is checked', () => {
    renderModal()

    const checkbox = screen.getByRole('checkbox', { name: /existing branch or pr/i })
    fireEvent.click(checkbox)

    const buttons = screen.getAllByRole('button')
    const branchBtn = buttons.find((b) => b.textContent === 'Branch')
    const prBtn = buttons.find((b) => b.textContent === 'Pull Request')
    expect(branchBtn).toBeDefined()
    expect(prBtn).toBeDefined()
  })
})
