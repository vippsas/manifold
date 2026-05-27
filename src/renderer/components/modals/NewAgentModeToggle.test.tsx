import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { NewAgentModeToggle } from './NewAgentModeToggle'

describe('NewAgentModeToggle', () => {
  it('renders both options and marks the active one', () => {
    render(<NewAgentModeToggle value="interactive" onChange={vi.fn()} />)
    const interactive = screen.getByRole('radio', { name: /interactive/i })
    const chat = screen.getByRole('radio', { name: /chat/i })
    expect(interactive).toHaveAttribute('aria-checked', 'true')
    expect(chat).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange when the inactive option is clicked', () => {
    const onChange = vi.fn()
    render(<NewAgentModeToggle value="interactive" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: /chat/i }))
    expect(onChange).toHaveBeenCalledWith('chat')
  })

  it('supports arrow-key navigation between options', () => {
    const onChange = vi.fn()
    render(<NewAgentModeToggle value="interactive" onChange={onChange} />)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('chat')
  })
})
