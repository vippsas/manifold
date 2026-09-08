import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceRepoStatus } from '../../../shared/workspace-types'
import { countWorkspaceChangedFiles, useWorkspaceRepoStatuses } from './workspace-git-status'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function status(projectId: string, path: string): WorkspaceRepoStatus {
  return {
    projectId,
    projectName: projectId,
    checkoutPath: `/worktrees/${projectId}`,
    branch: 'main',
    staged: [],
    unstaged: [{ path, type: 'modified' }],
    untracked: [],
  }
}

describe('countWorkspaceChangedFiles', () => {
  it('counts distinct changed files across the active workspace', () => {
    const repos: WorkspaceRepoStatus[] = [
      {
        projectId: 'p1',
        projectName: 'one',
        checkoutPath: '/worktrees/one',
        branch: 'feature',
        staged: [
          { path: 'src/both.ts', type: 'modified' },
          { path: 'src/staged.ts', type: 'modified' },
        ],
        unstaged: [
          { path: 'src/both.ts', type: 'modified' },
          { path: 'src/unstaged.ts', type: 'modified' },
        ],
        untracked: [],
      },
      {
        projectId: 'p2',
        projectName: 'two',
        checkoutPath: '/worktrees/two',
        branch: 'feature',
        staged: [],
        unstaged: [{ path: 'src/both.ts', type: 'modified' }],
        untracked: [],
      },
    ]

    expect(countWorkspaceChangedFiles(repos)).toBe(4)
  })

  it('counts untracked files, which are their own group', () => {
    const repos: WorkspaceRepoStatus[] = [
      {
        projectId: 'p1',
        projectName: 'one',
        checkoutPath: '/worktrees/one',
        branch: 'feature',
        staged: [],
        unstaged: [{ path: 'src/edited.ts', type: 'modified' }],
        untracked: [{ path: 'src/brand-new.ts', type: 'added' }],
      },
    ]

    expect(countWorkspaceChangedFiles(repos)).toBe(2)
  })
})

describe('useWorkspaceRepoStatuses', () => {
  it('shows cached workspace rows immediately while revalidating in the background', async () => {
    let resolveFreshA: ((value: WorkspaceRepoStatus[]) => void) | undefined
    let aRequests = 0
    mockInvoke.mockImplementation((_channel: string, workspaceId: string) => {
      if (workspaceId === 'ws-a') {
        aRequests += 1
        if (aRequests === 1) return Promise.resolve([status('repo-a', 'old.ts')])
        return new Promise<WorkspaceRepoStatus[]>((resolve) => { resolveFreshA = resolve })
      }
      return Promise.resolve([status('repo-b', 'b.ts')])
    })

    const { result, rerender } = renderHook(
      ({ workspaceId }) => useWorkspaceRepoStatuses(workspaceId),
      { initialProps: { workspaceId: 'ws-a' as string | null } },
    )

    await waitFor(() => { expect(result.current.repos[0]?.projectId).toBe('repo-a') })

    rerender({ workspaceId: 'ws-b' })
    // Never render repo A under workspace B while its first status is loading.
    expect(result.current.repos).toEqual([])
    await waitFor(() => { expect(result.current.repos[0]?.projectId).toBe('repo-b') })

    rerender({ workspaceId: 'ws-a' })
    // The last model paints synchronously, without waiting for the new IPC call.
    expect(result.current.repos[0]?.unstaged[0]?.path).toBe('old.ts')
    await waitFor(() => { expect(aRequests).toBe(2) })

    await act(async () => { resolveFreshA?.([status('repo-a', 'fresh.ts')]) })
    expect(result.current.repos[0]?.unstaged[0]?.path).toBe('fresh.ts')
  })
})

describe('useWorkspaceRepoStatuses polling', () => {
  it('revalidates on an interval, since no watcher covers workspace checkouts', async () => {
    vi.useFakeTimers()
    try {
      mockInvoke.mockResolvedValue([status('repo-a', 'a.ts')])
      renderHook(() => useWorkspaceRepoStatuses('ws-a'))
      await act(async () => {})
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mockInvoke).toHaveBeenCalledTimes(2)

      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mockInvoke).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not poll a hidden window, or pile a tick onto a status still in flight', async () => {
    vi.useFakeTimers()
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    try {
      mockInvoke.mockResolvedValue([status('repo-a', 'a.ts')])
      renderHook(() => useWorkspaceRepoStatuses('ws-a'))
      await act(async () => {})
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      // Visible again, but the next status never settles: later ticks must not stack.
      hidden.mockReturnValue(false)
      mockInvoke.mockReturnValue(new Promise(() => {}))
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(mockInvoke).toHaveBeenCalledTimes(2)
      await act(async () => { await vi.advanceTimersByTimeAsync(9000) })
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    } finally {
      hidden.mockRestore()
      vi.useRealTimers()
    }
  })
})
