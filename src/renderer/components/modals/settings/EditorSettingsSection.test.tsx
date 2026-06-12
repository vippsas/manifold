import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorSettingsSection } from './EditorSettingsSection'
import { DEFAULT_SETTINGS } from '../../../../shared/defaults'
import type { EditorSettings } from '../../../../shared/types'

const VALUE = DEFAULT_SETTINGS.editor as EditorSettings

describe('EditorSettingsSection', () => {
  it('renders the current font size', () => {
    render(<EditorSettingsSection value={VALUE} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Font Size/i)).toHaveValue(13)
  })

  it('calls onChange when font size changes', () => {
    const onChange = vi.fn()
    render(<EditorSettingsSection value={VALUE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/Font Size/i), { target: { value: '18' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, fontSize: 18 })
  })

  it('calls onChange when word wrap toggles', () => {
    const onChange = vi.fn()
    render(<EditorSettingsSection value={VALUE} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/^Word Wrap$/i), { target: { value: 'off' } })
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, wordWrap: 'off' })
  })

  it('renders markdown word wrap checked by default', () => {
    render(<EditorSettingsSection value={VALUE} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/Word wrap Markdown files/i)).toBeChecked()
  })

  it('calls onChange when markdown word wrap toggles', () => {
    const onChange = vi.fn()
    render(<EditorSettingsSection value={VALUE} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/Word wrap Markdown files/i))
    expect(onChange).toHaveBeenCalledWith({ ...VALUE, markdownWordWrap: false })
  })
})
