import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from './CommandPalette'
import { COMMANDS } from '../../../shared/commands/catalog'

const commitTitle = COMMANDS.find((c) => c.id === 'scm.commit')!.title

describe('CommandPalette', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(
      <CommandPalette visible={false} onRun={vi.fn()} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('lists commands and runs the highlighted one on Enter', () => {
    const onRun = vi.fn()
    render(<CommandPalette visible onRun={onRun} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.change(input, { target: { value: 'Toggle Theme' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRun).toHaveBeenCalledWith('view.toggleTheme')
  })

  it('filters the list by the typed query', () => {
    render(<CommandPalette visible onRun={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.change(input, { target: { value: 'Commit' } })
    expect(screen.getByText(commitTitle)).toBeInTheDocument()
    expect(screen.queryByText('Toggle Theme')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<CommandPalette visible onRun={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Type a command…'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
