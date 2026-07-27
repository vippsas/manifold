import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SettingsModal } from './SettingsModal'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  }
})

function renderModal(overrides = {}) {
  const defaultProps = {
    visible: true,
    settings: { ...DEFAULT_SETTINGS },
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }

  return { ...render(<SettingsModal {...defaultProps} />), props: defaultProps }
}

describe('SettingsModal', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <SettingsModal
        visible={false}
        settings={DEFAULT_SETTINGS}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(container.innerHTML).toBe('')
  })

  it('renders the settings dialog when visible', () => {
    renderModal()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /General/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Search AI/i })).toBeInTheDocument()
  })

  it('renders form fields with current settings values', () => {
    renderModal()

    // Default runtime select
    expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()

    // Theme button shows the current theme label
    expect(screen.getByText('Manifold Dark')).toBeInTheDocument()

    // Scrollback lines input
    const scrollbackInput = screen.getByDisplayValue('5000') as HTMLInputElement
    expect(scrollbackInput).toBeInTheDocument()

    // Default base branch input
    const branchInput = screen.getByDisplayValue('main') as HTMLInputElement
    expect(branchInput).toBeInTheDocument()

    expect(screen.queryByText('Use Manifold prompt in worktree shells')).toBeNull()
    expect(screen.getByLabelText(/^Enable Workspaces/)).not.toBeChecked()
  })

  it('calls onSave with settings when Save is clicked', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'manifold-dark',
        defaultRuntime: 'claude',
        scrollbackLines: 5000,
        defaultBaseBranch: 'main',
      }),
    )
  })

  it('calls onClose after save', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByText('Save'))

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked without saving', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByText('Cancel'))

    expect(props.onClose).toHaveBeenCalled()
    expect(props.onSave).not.toHaveBeenCalled()
  })

  it('calls onClose when Escape key is pressed', () => {
    const { props } = renderModal()

    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(props.onClose).toHaveBeenCalled()
  })

  it('calls onClose when close X button is clicked', () => {
    const { props } = renderModal()

    const closeButtons = screen.getAllByRole('button')
    const xButton = closeButtons.find((btn) => btn.textContent === '\u00D7')
    expect(xButton).toBeDefined()
    fireEvent.click(xButton!)

    expect(props.onClose).toHaveBeenCalled()
  })

  it('updates scrollback lines when input changes', () => {
    const { props } = renderModal()

    const input = screen.getByDisplayValue('5000') as HTMLInputElement
    fireEvent.change(input, { target: { value: '10000' } })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ scrollbackLines: 10000 }),
    )
  })

  it('updates default base branch when input changes', () => {
    const { props } = renderModal()

    const input = screen.getByDisplayValue('main') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'develop' } })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBaseBranch: 'develop' }),
    )
  })

  it('changes default runtime selection', () => {
    const { props } = renderModal()

    const select = screen.getByDisplayValue('Claude Code')
    fireEvent.change(select, { target: { value: 'codex' } })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRuntime: 'codex' }),
    )
  })

  it('enables the optional workspace sidebar', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByLabelText(/^Enable Workspaces/))
    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ workspacesEnabled: true }),
    )
  })

  it('shows theme label for the current theme', () => {
    renderModal({
      settings: { ...DEFAULT_SETTINGS, theme: 'manifold-dark' },
    })

    expect(screen.getByText('Manifold Dark')).toBeInTheDocument()
  })

  it('switches between settings tabs', () => {
    renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Search AI/i }))

    expect(screen.getByText('Answering And Reranking')).toBeInTheDocument()
    expect(screen.getByText('AI Search Mode')).toBeInTheDocument()
    expect(screen.queryByText('Storage Directory')).not.toBeInTheDocument()
  })

  it('shows desktop notifications and the sound toggle on the dedicated Notifications tab', () => {
    renderModal()

    // Not on the General tab anymore.
    expect(screen.queryByText('Desktop Notifications')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Play sound when agent stops running')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Notifications/i }))

    expect(screen.getByText('Desktop Notifications')).toBeInTheDocument()
    expect(screen.getByLabelText('Play sound when agent stops running')).toBeInTheDocument()
    expect(screen.queryByText('Storage Directory')).not.toBeInTheDocument()
  })

  it('saves notification settings and the sound toggle from the Notifications tab', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Notifications/i }))
    // Notifications are off by default, so the per-event checkboxes are disabled
    // until the master toggle is enabled.
    fireEvent.click(screen.getByLabelText('Enable desktop notifications'))
    fireEvent.click(screen.getByLabelText('When an agent hits an error'))
    fireEvent.click(screen.getByLabelText('Play sound when agent stops running'))

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationSound: false,
        notifications: expect.objectContaining({ enabled: true, onError: false }),
      }),
    )
  })

  it('saves updated search ai settings from the dedicated tab', () => {
    const { props } = renderModal()

    fireEvent.click(screen.getByRole('tab', { name: /Search AI/i }))
    fireEvent.change(screen.getByDisplayValue('Grounded answers'), { target: { value: 'rerank' } })
    fireEvent.change(screen.getByDisplayValue('6'), { target: { value: '4' } })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        search: {
          ai: expect.objectContaining({
            mode: 'rerank',
            citationLimit: 4,
          }),
        },
      }),
    )
  })
})
