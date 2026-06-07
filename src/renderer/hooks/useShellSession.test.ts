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
  it('recreates the worktree shell when the prompt mode changes', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ shellPrompt }) => useShellSessions('/worktree', '/project', 'agent-1', shellPrompt),
      { initialProps: { shellPrompt: true } },
    )

    await waitFor(() => expect(result.current.worktreeSessionId).toBe('shell-1'))

    rerender({ shellPrompt: false })

    await waitFor(() => expect(result.current.worktreeSessionId).toBe('shell-2'))
    expect(mockInvoke).toHaveBeenCalledWith('agent:kill', 'shell-1')

    unmount()
  })
})
