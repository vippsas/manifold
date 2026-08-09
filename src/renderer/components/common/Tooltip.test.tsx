import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Tooltip } from './Tooltip'

const renderTrigger = (): void => {
  render(
    <Tooltip label="Workspace actions" detail="New worktree, add a folder, rename.">
      <button type="button" aria-label="Actions for alpha-space">+</button>
    </Tooltip>,
  )
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Actions for alpha-space' })

/** Lets the open delay elapse. */
const rest = (ms = 300): void => {
  act(() => { vi.advanceTimersByTime(ms) })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Tooltip', () => {
  it('says nothing until the pointer has rested on the trigger', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    act(() => { vi.advanceTimersByTime(100) })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    rest()

    expect(screen.getByRole('tooltip')).toHaveTextContent('Workspace actions')
  })

  it('carries the detail line — what the action gets you, not just its name', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    rest()

    expect(screen.getByRole('tooltip')).toHaveTextContent('New worktree, add a folder, rename.')
  })

  // The words have to reach keyboard users too, or they are mouse-only trivia.
  it('shows on focus as well as hover', () => {
    renderTrigger()

    fireEvent.focus(trigger())
    rest()

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('hides when the pointer leaves', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    rest()
    fireEvent.pointerLeave(trigger())

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  // A pending tooltip must not open over the menu the click just opened.
  it('drops a pending tooltip when the trigger is pressed', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    fireEvent.pointerDown(trigger())
    rest()

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    rest()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  // It portals to document.body: inside a dockview panel the transformed
  // overlay would offset `position: fixed` from the measured viewport point.
  it('renders the bubble outside the trigger, on document.body', () => {
    renderTrigger()

    fireEvent.pointerEnter(trigger())
    rest()

    const bubble = screen.getByRole('tooltip')
    expect(trigger().contains(bubble)).toBe(false)
    expect(bubble.parentElement).toBe(document.body)
  })
})
