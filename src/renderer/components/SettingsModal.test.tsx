import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SettingsModal } from './SettingsModal'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

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
  })

  it('renders form fields with current settings values', () => {
    renderModal()

    // Default runtime select
    expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument()

    // Theme select
    expect(screen.getByDisplayValue('Dark')).toBeInTheDocument()

    // Scrollback lines input
    const scrollbackInput = screen.getByDisplayValue('5000') as HTMLInputElement
    expect(scrollbackInput).toBeInTheDocument()

    // Default base branch input
    const branchInput = screen.getByDisplayValue('main') as HTMLInputElement
    expect(branchInput).toBeInTheDocument()
  })

  it('calls onSave with updated settings when Save is clicked', () => {
    const { props } = renderModal()

    // Change theme to light
    const themeSelect = screen.getByDisplayValue('Dark')
    fireEvent.change(themeSelect, { target: { value: 'light' } })

    fireEvent.click(screen.getByText('Save'))

    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: 'light',
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

  it('resets form values when reopened with new settings', () => {
    const { rerender } = renderModal({ visible: false })

    rerender(
      <SettingsModal
        visible={true}
        settings={{ ...DEFAULT_SETTINGS, theme: 'light' }}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByDisplayValue('Light')).toBeInTheDocument()
  })
})
