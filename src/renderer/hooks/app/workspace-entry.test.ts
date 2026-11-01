import { describe, it, expect } from 'vitest'
import { resolveWorkspaceEntry, type WorkspaceEntryContext } from './workspace-entry'
import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'

const session = (id: string, projectId: string): AgentSession => ({
  id, projectId, runtimeId: 'claude', branchName: '', worktreePath: '/wt', status: 'running', pid: 1, additionalDirs: [],
})

// A home workspace spanning several folders — the shape a favorite most often
// points at, and the one that made the mismatch visible.
const multi: Workspace = { id: 'wm', name: 'ai-labs', projectIds: ['pa', 'pb', 'pc'], createdAt: '1' }
const other: Workspace = { id: 'wo', name: 'manifold', projectIds: ['px'], createdAt: '2' }

const ctx = (overrides: Partial<WorkspaceEntryContext> = {}): WorkspaceEntryContext => ({
  workspaces: [multi, other],
  sessionsByWorkspace: {},
  activeSessionId: null,
  activeProjectId: null,
  ...overrides,
})

describe('resolveWorkspaceEntry', () => {
  it('keeps the agent on screen when it already lives in the workspace', () => {
    const entry = resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wm: [session('s1', 'pa')] },
      activeSessionId: 's1',
    }))
    expect(entry).toEqual({ kind: 'keep' })
  })

  it('moves to the workspace\'s own agent when the active one belongs elsewhere', () => {
    const mine = session('s1', 'pa')
    const entry = resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wm: [mine], wo: [session('s9', 'px')] },
      activeSessionId: 's9',
    }))
    expect(entry).toEqual({ kind: 'agent', session: mine })
  })

  it('restores the remembered sibling, including one in another folder', () => {
    const sibling = session('s2', 'pb')
    expect(resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wm: [session('s1', 'pa'), sibling] },
      activeSessionId: 's9',
      rememberedSessionId: sibling.id,
    }))).toEqual({ kind: 'agent', session: sibling })
  })

  it('restores workspace memory ahead of a different active agent shared by both workspaces', () => {
    const sibling = session('s2', 'pa')
    expect(resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wm: [session('s1', 'pa'), sibling] },
      activeSessionId: 's1',
      rememberedSessionId: sibling.id,
    }))).toEqual({ kind: 'agent', session: sibling })
  })

  it.each(['deleted', 'foreign'])('falls back to the primary for a %s remembered agent', (id) => {
    const primary = session('s1', 'pa')
    expect(resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wm: [primary], wo: [session('foreign', 'pa')] },
      rememberedSessionId: id,
    }))).toEqual({ kind: 'agent', session: primary })
  })

  it('returns an empty entry when the remembered agent is gone and none remain', () => {
    expect(resolveWorkspaceEntry('wm', ctx({ rememberedSessionId: 'deleted' })))
      .toEqual({ kind: 'empty', projectId: 'pa' })
  })

  it('selects the first folder and clears the agent when the workspace holds none', () => {
    const entry = resolveWorkspaceEntry('wm', ctx({
      sessionsByWorkspace: { wo: [session('s9', 'px')] },
      activeSessionId: 's9',
    }))
    expect(entry).toEqual({ kind: 'empty', projectId: 'pa' })
  })

  it('keeps the selected folder when the workspace already spans it', () => {
    const entry = resolveWorkspaceEntry('wm', ctx({ activeProjectId: 'pc' }))
    expect(entry).toEqual({ kind: 'empty', projectId: 'pc' })
  })

  it('reports no folder for an unknown workspace rather than throwing', () => {
    expect(resolveWorkspaceEntry('nope', ctx())).toEqual({ kind: 'empty', projectId: null })
  })
})
