import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useDiff } from './useDiff'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  window.electronAPI = {
    invoke: mockInvoke,
    send: vi.fn(),
    on: mockOn,
    getPathForFile: vi.fn(),
  }
})

describe('useDiff', () => {
  it('does not invoke IPC when sessionId is null', async () => {
    renderHook(() => useDiff(null))
    // Give any async effects a chance to run
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('invokes diff:get when sessionId is a real session id', async () => {
    mockInvoke.mockResolvedValueOnce({ diff: 'diff text', changedFiles: [] })
    const { result } = renderHook(() => useDiff('session-real-id'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockInvoke).toHaveBeenCalledWith('diff:get', 'session-real-id')
  })
})
