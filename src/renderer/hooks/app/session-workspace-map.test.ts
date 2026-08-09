import { describe, expect, it } from 'vitest'
import type { AgentSession } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { groupSessionsByWorkspace } from './session-workspace-map'

const REPO = 'repo-1'

function session(id: string, extra: Partial<AgentSession> = {}): AgentSession {
  return {
    id,
    projectId: REPO,
    runtimeId: 'claude',
    branchName: 'main',
    worktreePath: '/repo',
    status: 'done',
    ...extra,
  } as AgentSession
}

const home: Workspace = {
  id: 'home', name: 'repo-1', projectIds: [REPO], createdAt: '2026-01-01T00:00:00.000Z',
}
const worktreeWorkspace: Workspace = {
  id: 'levanger', name: 'Levanger', projectIds: [REPO], createdAt: '2026-01-02T00:00:00.000Z',
  branchName: 'manifold/levanger', worktreePaths: { [REPO]: '/worktrees/levanger' },
}

describe('groupSessionsByWorkspace', () => {
  it('lists an agent under the workspace it names', () => {
    const map = groupSessionsByWorkspace(
      { [REPO]: [session('s1', { workspaceId: 'levanger' })] },
      [home, worktreeWorkspace],
    )
    expect(map.levanger?.map((s) => s.id)).toEqual(['s1'])
    expect(map.home).toBeUndefined()
  })

  it('places a workspace-less agent in the home workspace holding its repo', () => {
    const map = groupSessionsByWorkspace({ [REPO]: [session('s1')] }, [home])
    expect(map.home?.map((s) => s.id)).toEqual(['s1'])
  })

  // The bug behind "New Workspace, Same Folders shows the old agent": a new
  // worktree workspace spans the same repo, so a workspace-less agent working in
  // the repo's own clone was adopted by it too — becoming its primary session,
  // which the agent panel renders and the sidebar row lights a dot for.
  it('never adopts a workspace-less agent into a worktree workspace over the same repo', () => {
    const map = groupSessionsByWorkspace(
      { [REPO]: [session('s1')] },
      [home, worktreeWorkspace],
    )
    expect(map.home?.map((s) => s.id)).toEqual(['s1'])
    expect(map.levanger ?? []).toEqual([])
  })

  it('leaves a fresh worktree workspace empty so it can offer to start an agent', () => {
    const map = groupSessionsByWorkspace({ [REPO]: [session('s1')] }, [home, worktreeWorkspace])
    expect(map[worktreeWorkspace.id] ?? []).toHaveLength(0)
  })
})
