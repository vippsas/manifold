import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useShellSessions } from './useShellSession'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  let counter = 0
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'shell:create') {
      counter += 1
      return Promise.resolve({ sessionId: `shell-${counter}` })
    }
    if (channel === 'agent:kill') return Promise.resolve(undefined)
    return Promise.resolve(undefined)
  })

  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
  }
})

describe('useShellSessions', () => {
  it('creates the primary worktree shell as a Manifold shell', async () => {
    const { result, unmount } = renderHook(
      () => useShellSessions('/worktree', '/project', 'agent-1'),
    )

    await waitFor(() => expect(result.current.worktreeSessionId).toBe('shell-1'))

    expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/worktree', { mode: 'manifold' })

    unmount()
  })

  it('creates a project fallback shell as a Manifold shell when there is no worktree cwd', async () => {
    const { result, unmount } = renderHook(
      () => useShellSessions(null, '/project', 'agent-1'),
    )

    await waitFor(() => expect(result.current.projectSessionId).toBe('shell-1'))

    expect(mockInvoke).toHaveBeenCalledWith('shell:create', '/project', { mode: 'manifold' })

    unmount()
  })
})
