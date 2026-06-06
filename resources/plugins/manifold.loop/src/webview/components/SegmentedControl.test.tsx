import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentedControl } from './SegmentedControl'

const OPTS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

describe('SegmentedControl', () => {
  it('marks the active option with aria-checked and calls onChange on click', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="b" onChange={onChange} ariaLabel="Pick" />)
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('moves selection with ArrowRight/ArrowLeft (wrapping)', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="c" onChange={onChange} ariaLabel="Pick" />)
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('a') // wraps c -> a
    onChange.mockClear()
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('b') // c -> b
  })

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="a" onChange={onChange} ariaLabel="Pick" disabled />)
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
