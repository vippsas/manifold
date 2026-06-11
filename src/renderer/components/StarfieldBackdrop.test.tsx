import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { StarfieldBackdrop } from './StarfieldBackdrop'

describe('StarfieldBackdrop', () => {
  it('renders an aria-hidden decoration with star and grid layers', () => {
    const { container } = render(<StarfieldBackdrop />)

    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('data-testid')).toBe('starfield-backdrop')
    expect(root.style.pointerEvents).toBe('none')
    expect(root.children).toHaveLength(2)

    const stars = root.children[0] as HTMLElement
    expect(stars.style.backgroundImage).toContain('radial-gradient')
    expect(stars.style.backgroundImage).toContain('var(--star-tint')

    const horizon = root.children[1] as HTMLElement
    expect(horizon.style.backgroundImage).toContain('repeating-linear-gradient')
    expect(horizon.style.transform).toContain('perspective')
  })
})
