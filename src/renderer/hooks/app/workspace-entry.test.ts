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
