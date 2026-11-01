import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import type { WorkspaceRepoStatus } from '../../../shared/workspace-types'
import type { WorkspaceGitContext } from './workspace-git-events'
import { useWorkspaceRepoStatuses } from './workspace-git-status'

const invoke = vi.fn()
const listeners = new Map<string, (event: unknown) => void>()
const rows: WorkspaceRepoStatus[] = ['p1', 'p2'].map((projectId) => ({
  projectId, projectName: projectId, checkoutPath: `/checkouts/${projectId}`, branch: 'main',
  staged: [], unstaged: [], untracked: [],
}))
const session = (id: string, worktreePath: string): AgentSession => ({
  id, worktreePath, projectId: 'p1', workspaceId: 'another-workspace',
  runtimeId: 'codex', branchName: 'main', status: 'waiting', pid: null, additionalDirs: [],
})
const context: WorkspaceGitContext = {
  workspace: { id: 'ws', name: 'Workspace', projectIds: ['p1', 'p2'], createdAt: '',
    worktreePaths: { p1: '/checkouts/p1', p2: '/checkouts/p2' } },
  projects: ['p1', 'p2'].map((id) => ({ id, name: id, path: `/repos/${id}`, baseBranch: 'main', addedAt: '' })),
  sessionsByProject: { p1: [
    session('outside', '/checkouts/p1-other'), session('shared', '/checkouts//p1/./'),
    session('clone', '/repos/p1/'),
  ] },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function files(sessionId: string, source?: string): void {
  listeners.get('files:changed')?.({ sessionId, source, changes: [] })
}

beforeEach(() => {
  vi.useFakeTimers()
  invoke.mockReset().mockResolvedValue(rows)
  listeners.clear()
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  window.electronAPI = {
    invoke, send: vi.fn(), getPathForFile: vi.fn(),
    on: vi.fn((channel, listener) => {
      listeners.set(channel, listener)
      return () => { listeners.delete(channel) }
    }),
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('workspace git refresh scheduling', () => {
  it('coalesces files, focus and a timer tick into one in-flight and one trailing invoke', async () => {
    const first = deferred<WorkspaceRepoStatus[]>()
    const trailing = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(trailing.promise)
    renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {
      for (let i = 0; i < 8; i++) files('shared')
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => { first.resolve(rows) })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke.mock.calls[1]).toEqual(['git:workspace-status', 'ws'])
    await act(async () => { trailing.resolve(rows) })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('filters known outside checkouts but refreshes shared paths, clones and unknown sessions', async () => {
    renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {})
    await act(async () => { files('outside') })
    expect(invoke).toHaveBeenCalledTimes(1)
    await act(async () => { files('shared') })
    expect(invoke.mock.calls[1]).toEqual(['git:workspace-status', 'ws', ['p1']])
    await act(async () => { files('clone') })
    expect(invoke.mock.calls[2]).toEqual(['git:workspace-status', 'ws', ['p1']])
    await act(async () => { files('new-session') })
    expect(invoke.mock.calls[3]).toEqual(['git:workspace-status', 'ws'])
  })

  it('uses additional-dir source paths, and merges partial repo rows without losing siblings', async () => {
    const { result } = renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {})
    invoke.mockResolvedValue([{ ...rows[1], branch: 'updated', upstreamAheadBehind: { ahead: 3, behind: 2 } }])
    await act(async () => { files('outside', '/checkouts/p2/../p2/') })
    expect(invoke.mock.calls[1]).toEqual(['git:workspace-status', 'ws', ['p2']])
    expect(result.current.repos).toEqual([rows[0], { ...rows[1], branch: 'updated', upstreamAheadBehind: { ahead: 3, behind: 2 } }])
    await act(async () => { files('shared', '/elsewhere') })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('unions affected repos during a pending partial refresh', async () => {
    renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {})
    const pending = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(pending.promise)
    act(() => { files('shared') })
    act(() => { files('shared'); files('outside', '/checkouts/p2') })
    expect(invoke).toHaveBeenCalledTimes(2)
    await act(async () => { pending.resolve([rows[0]]) })
    expect(invoke.mock.calls[2]).toEqual(['git:workspace-status', 'ws', ['p1', 'p2']])
  })

  it('defers all hidden triggers and resumes on visibility without stacking requests', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const first = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(first.promise)
    renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {
      files('shared')
      window.dispatchEvent(new Event('focus'))
      await vi.advanceTimersByTimeAsync(15000)
    })
    expect(invoke).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(invoke).toHaveBeenCalledTimes(1)
    hidden.mockReturnValue(true)
    act(() => { files('shared'); window.dispatchEvent(new Event('focus')) })
    await act(async () => { first.resolve(rows) })
    expect(invoke).toHaveBeenCalledTimes(1)
    hidden.mockReturnValue(false)
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('never replaces B with A when A finishes after a workspace switch', async () => {
    const slow = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(slow.promise).mockResolvedValueOnce([rows[1]])
    const { result, rerender } = renderHook(({ id }) => useWorkspaceRepoStatuses(id), { initialProps: { id: 'a' } })
    act(() => { files('unknown') }) // a trailing refresh must not run after leaving A
    rerender({ id: 'b' })
    await act(async () => {})
    expect(result.current.repos).toEqual([rows[1]])
    await act(async () => { slow.resolve([rows[0]]) })
    expect(result.current.repos).toEqual([rows[1]])
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('bounds dormant reconciliation at 15s and resets on focus, files and workspace switches', async () => {
    const { rerender } = renderHook(({ id }) => useWorkspaceRepoStatuses(id, context), { initialProps: { id: 'ws' } })
    await act(async () => {})
    for (const gap of [3000, 6000, 12000, 15000, 15000]) {
      const count = invoke.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(gap - 3000) })
      expect(invoke).toHaveBeenCalledTimes(count)
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(invoke).toHaveBeenCalledTimes(count + 1)
    }
    for (const trigger of [
      () => window.dispatchEvent(new Event('focus')),
      () => files('shared'),
      () => rerender({ id: 'other' }),
    ]) {
      await act(async () => { trigger() })
      const count = invoke.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
      expect(invoke).toHaveBeenCalledTimes(count + 1)
      await act(async () => { await vi.advanceTimersByTimeAsync(45000) })
    }
  })

  it('does not start a trailing invoke after unmount', async () => {
    const pending = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(pending.promise)
    const { unmount } = renderHook(() => useWorkspaceRepoStatuses('ws', context))
    act(() => { files('shared') })
    unmount()
    await act(async () => { pending.resolve(rows) })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it.each(['focus', 'files'])('keeps the 3s cadence when %s interrupts an idle poll', async (trigger) => {
    renderHook(() => useWorkspaceRepoStatuses('ws', context))
    await act(async () => {})
    const pending = deferred<WorkspaceRepoStatus[]>()
    invoke.mockReturnValueOnce(pending.promise)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    act(() => {
      if (trigger === 'focus') window.dispatchEvent(new Event('focus'))
      else files('shared')
    })
    await act(async () => { pending.resolve(rows) })
    expect(invoke).toHaveBeenCalledTimes(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(invoke).toHaveBeenCalledTimes(4)
  })
})
