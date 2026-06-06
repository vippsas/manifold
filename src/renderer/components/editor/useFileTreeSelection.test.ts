import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFileTreeSelection } from './useFileTreeSelection'

const ORDER = ['/a', '/b', '/c', '/d']

describe('useFileTreeSelection', () => {
  it('selectOnly replaces the selection and sets the cursor', () => {
    const { result } = renderHook(() => useFileTreeSelection())
    act(() => result.current.selectOnly('/b'))
    expect([...result.current.selectedPaths]).toEqual(['/b'])
    expect(result.current.cursorPath).toBe('/b')
  })

  it('toggleSelect adds and removes without clearing others', () => {
    const { result } = renderHook(() => useFileTreeSelection())
    act(() => result.current.selectOnly('/a'))
    act(() => result.current.toggleSelect('/c'))
    expect([...result.current.selectedPaths].sort()).toEqual(['/a', '/c'])
    act(() => result.current.toggleSelect('/a'))
    expect([...result.current.selectedPaths]).toEqual(['/c'])
  })

  it('rangeSelectTo selects the contiguous span from the anchor', () => {
    const { result } = renderHook(() => useFileTreeSelection())
    act(() => result.current.selectOnly('/b'))
    act(() => result.current.rangeSelectTo('/d', ORDER))
    expect([...result.current.selectedPaths]).toEqual(['/b', '/c', '/d'])
    expect(result.current.cursorPath).toBe('/d')
  })

  it('rangeSelectTo works upward too', () => {
    const { result } = renderHook(() => useFileTreeSelection())
    act(() => result.current.selectOnly('/c'))
    act(() => result.current.rangeSelectTo('/a', ORDER))
    expect([...result.current.selectedPaths]).toEqual(['/a', '/b', '/c'])
  })

  it('clearSelection empties the selection and cursor', () => {
    const { result } = renderHook(() => useFileTreeSelection())
    act(() => result.current.selectOnly('/a'))
    act(() => result.current.clearSelection())
    expect([...result.current.selectedPaths]).toEqual([])
    expect(result.current.cursorPath).toBeNull()
  })
})
