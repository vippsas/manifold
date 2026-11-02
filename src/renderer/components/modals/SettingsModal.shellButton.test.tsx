import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SettingsModal } from './SettingsModal'
import { DEFAULT_SETTINGS } from '../../../shared/defaults'

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(() => vi.fn()),
    send: vi.fn(),
  }
})

describe('SettingsModal — bottom Shell button toggle', () => {
  it('is off by default and saves true once ticked', () => {
    const onSave = vi.fn()
    render(<SettingsModal visible settings={{ ...DEFAULT_SETTINGS }} onSave={onSave} onClose={vi.fn()} />)

    const toggle = screen.getByRole('checkbox', { name: /Show a Shell button in the status bar/i })
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ showBottomShellButton: true }))
  })

  it('reflects a saved true value and saves false once cleared', () => {
    const onSave = vi.fn()
    render(<SettingsModal visible settings={{ ...DEFAULT_SETTINGS, showBottomShellButton: true }} onSave={onSave} onClose={vi.fn()} />)

    const toggle = screen.getByRole('checkbox', { name: /Show a Shell button in the status bar/i })
    expect(toggle).toBeChecked()

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ showBottomShellButton: false }))
  })
})
