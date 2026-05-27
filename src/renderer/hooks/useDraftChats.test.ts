import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDraftChats } from './useDraftChats'

describe('useDraftChats', () => {
  it('starts with no drafts', () => {
    const { result } = renderHook(() => useDraftChats())
    expect(result.current.drafts).toEqual([])
  })

  it('creates a draft and returns it with a synthetic id', () => {
    const { result } = renderHook(() => useDraftChats())
    let created!: ReturnType<typeof result.current.createDraft>
    act(() => {
      created = result.current.createDraft({
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/oslo',
      })
    })
    expect(created.id).toMatch(/^draft-/)
    expect(result.current.drafts).toHaveLength(1)
    expect(result.current.drafts[0]).toEqual(created)
  })

  it('discards a draft by id', () => {
    const { result } = renderHook(() => useDraftChats())
    let id = ''
    act(() => {
      id = result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' }).id
    })
    act(() => result.current.discardDraft(id))
    expect(result.current.drafts).toEqual([])
  })

  it('discardDraft on an unknown id is a no-op', () => {
    const { result } = renderHook(() => useDraftChats())
    act(() => {
      result.current.createDraft({ projectId: 'p1', runtimeId: 'claude' })
    })
    act(() => result.current.discardDraft('does-not-exist'))
    expect(result.current.drafts).toHaveLength(1)
  })
})
