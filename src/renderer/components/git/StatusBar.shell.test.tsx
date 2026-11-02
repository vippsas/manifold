import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { StatusBar } from './StatusBar'

beforeEach(() => {
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: vi.fn().mockResolvedValue([]),
    on: vi.fn(() => vi.fn()),
  }
})

describe('StatusBar shell button', () => {
  it('renders no Shell button unless a toggle is supplied (the default bar is unchanged)', () => {
    render(<StatusBar activeSession={null} changedFiles={[]} baseBranch="main" />)

    expect(screen.queryByRole('button', { name: /shell/i })).not.toBeInTheDocument()
  })

  it('renders a Shell button that calls the toggle', () => {
    const onToggleShell = vi.fn()
    render(<StatusBar activeSession={null} changedFiles={[]} baseBranch="main" onToggleShell={onToggleShell} />)

    fireEvent.click(screen.getByRole('button', { name: 'Shell' }))

    expect(onToggleShell).toHaveBeenCalledTimes(1)
  })

  it('shows the pressed state only while the shell panel is open', () => {
    const { rerender } = render(
      <StatusBar activeSession={null} changedFiles={[]} baseBranch="main" onToggleShell={vi.fn()} shellOpen={false} />,
    )
    expect(screen.getByRole('button', { name: 'Shell' })).toHaveAttribute('aria-pressed', 'false')

    rerender(<StatusBar activeSession={null} changedFiles={[]} baseBranch="main" onToggleShell={vi.fn()} shellOpen />)

    const button = screen.getByRole('button', { name: 'Shell' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('statusbar-button--pressed')
  })
})
