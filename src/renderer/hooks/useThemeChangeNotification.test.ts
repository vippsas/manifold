import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useThemeChangeNotification } from './useThemeChangeNotification'

type Props = { type: 'light' | 'dark'; active: boolean }
const render = (initial: Props) =>
  renderHook(({ type, active }) => useThemeChangeNotification(type, active), { initialProps: initial })

describe('useThemeChangeNotification', () => {
  it('does not announce on initial mount', () => {
    const { result } = render({ type: 'light', active: true })
    expect(result.current.show).toBe(false)
  })

  it('announces when the theme type flips while an interactive agent is active', () => {
    const { result, rerender } = render({ type: 'light', active: true })
    rerender({ type: 'dark', active: true })
    expect(result.current.show).toBe(true)
    expect(result.current.mode).toBe('dark')
  })

  it('stays silent when no interactive agent is active', () => {
    const { result, rerender } = render({ type: 'light', active: false })
    rerender({ type: 'dark', active: false })
    expect(result.current.show).toBe(false)
  })

  it('stays silent when the same theme type re-renders', () => {
    const { result, rerender } = render({ type: 'dark', active: true })
    rerender({ type: 'dark', active: true })
    expect(result.current.show).toBe(false)
  })

  it('can be dismissed', () => {
    const { result, rerender } = render({ type: 'light', active: true })
    rerender({ type: 'dark', active: true })
    expect(result.current.show).toBe(true)
    act(() => result.current.dismiss())
    expect(result.current.show).toBe(false)
  })
})
