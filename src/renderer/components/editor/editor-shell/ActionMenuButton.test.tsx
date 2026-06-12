import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionMenuButton } from './ActionMenuButton'

describe('ActionMenuButton', () => {
  it('renders an item description when provided', () => {
    render(
      <ActionMenuButton
        buttonLabel="+"
        title="Open"
        menuLabel="Modules"
        items={[{ id: 'a', label: 'Ideas', description: 'Idea feed.', action: vi.fn() }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByText('Ideas')).toBeInTheDocument()
    expect(screen.getByText('Idea feed.')).toBeInTheDocument()
  })

  it('fires the item action and closes the menu on click', () => {
    const action = vi.fn()
    render(
      <ActionMenuButton
        buttonLabel="+"
        title="Open"
        menuLabel="Modules"
        items={[{ id: 'a', label: 'Ideas', action }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Ideas/ }))
    expect(action).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
