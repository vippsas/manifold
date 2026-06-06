// src/plugin-host/workspace-api.test.ts
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceContext } from './workspace-api'

describe('WorkspaceContext', () => {
  it('setActiveContext updates activeProject and activeSession', () => {
    const ctx = new WorkspaceContext()
    const api = ctx.makeApi()
    expect(api.activeProject).toBeUndefined()
    expect(api.activeSession).toBeUndefined()

    ctx.setActiveContext({ project: { id: 'p1', name: 'Proj1', path: '/p1' }, session: { id: 's1', status: 'running' } })
    expect(api.activeProject?.id).toBe('p1')
    expect(api.activeSession?.id).toBe('s1')
  })

  it('onDidChangeActiveProject fires only when the project id changes (not on session-only change)', () => {
    const ctx = new WorkspaceContext()
    const api = ctx.makeApi()
    const projectListener = vi.fn()
    api.onDidChangeActiveProject(projectListener)

    // Session change only — should NOT fire project listener
    ctx.setActiveContext({ session: { id: 's1', status: 'running' } })
    expect(projectListener).not.toHaveBeenCalled()

    // Project change — should fire
    ctx.setActiveContext({ project: { id: 'p1', name: 'Proj1', path: '/p1' }, session: { id: 's1', status: 'running' } })
    expect(projectListener).toHaveBeenCalledTimes(1)
    expect(projectListener).toHaveBeenCalledWith({ id: 'p1', name: 'Proj1', path: '/p1' })

    // Same project id, session changes — should NOT fire project listener again
    ctx.setActiveContext({ project: { id: 'p1', name: 'Proj1', path: '/p1' }, session: { id: 's2', status: 'idle' } })
    expect(projectListener).toHaveBeenCalledTimes(1)

    // Different project id — should fire again
    ctx.setActiveContext({ project: { id: 'p2', name: 'Proj2', path: '/p2' } })
    expect(projectListener).toHaveBeenCalledTimes(2)
    expect(projectListener).toHaveBeenLastCalledWith({ id: 'p2', name: 'Proj2', path: '/p2' })
  })

  it('disposing a listener stops it from receiving further updates', () => {
    const ctx = new WorkspaceContext()
    const api = ctx.makeApi()
    const listener = vi.fn()
    const disposable = api.onDidChangeActiveProject(listener)

    ctx.setActiveContext({ project: { id: 'p1', name: 'P', path: '/p' } })
    expect(listener).toHaveBeenCalledTimes(1)

    disposable.dispose()

    ctx.setActiveContext({ project: { id: 'p2', name: 'Q', path: '/q' } })
    expect(listener).toHaveBeenCalledTimes(1) // still 1, not called after dispose
  })
})

describe('WorkspaceContext — workspaceFolders', () => {
  it('is undefined when there is no active session', () => {
    const ctx = new WorkspaceContext()
    expect(ctx.makeApi().workspaceFolders).toBeUndefined()
    expect(ctx.activeSessionId).toBeUndefined()
  })

  it('reflects the active session worktree path and id', () => {
    const ctx = new WorkspaceContext()
    ctx.setActiveContext({ session: { id: 's1', status: 'running', branchName: 'feat/x', worktreePath: '/wt/s1' } })
    expect(ctx.activeSessionId).toBe('s1')
    expect(ctx.makeApi().workspaceFolders).toEqual([{ name: 'feat/x', uri: '/wt/s1' }])
  })

  it('is undefined when the active session has no worktree path', () => {
    const ctx = new WorkspaceContext()
    ctx.setActiveContext({ session: { id: 's1', status: 'running' } })
    expect(ctx.makeApi().workspaceFolders).toBeUndefined()
  })
})
