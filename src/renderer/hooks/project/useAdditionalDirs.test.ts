import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAdditionalDirs } from './useAdditionalDirs'
import type { FileTreeNode } from '../../../shared/types'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockImplementation((channel: string, _sessionId: string, dirPath: string) => {
    if (channel === 'files:tree-dir') {
      return Promise.resolve({ path: dirPath, name: dirPath, isDirectory: true, children: [] } as FileTreeNode)
    }
    if (channel === 'files:dir-branch') return Promise.resolve('main')
    return Promise.resolve(null)
  })
  window.electronAPI = {
    invoke: mockInvoke,
    send: vi.fn(),
    on: mockOn,
    getPathForFile: vi.fn(),
  }
})

describe('useAdditionalDirs', () => {
  it('clears additional trees when switching to a session with no additional dirs', async () => {
    // Workspace agent: two additional repo roots.
    const { result, rerender } = renderHook(
      ({ sessionId, dirs }: { sessionId: string; dirs: string[] }) => useAdditionalDirs(sessionId, dirs),
      { initialProps: { sessionId: 'ws-session', dirs: ['/repo/ws-2', '/repo/ws-3'] } }
    )

    await waitFor(() => expect(result.current.additionalTrees.size).toBe(2))

    // Switch to a single-repo agent: no additional dirs. The workspace roots must not leak.
    rerender({ sessionId: 'repo-session', dirs: [] })

    await waitFor(() => expect(result.current.additionalTrees.size).toBe(0))
    expect(result.current.additionalDirs).toEqual([])
  })
})
