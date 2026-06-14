import { describe, it, expect } from 'vitest'
import { createWorktreeOverviewService, type WorktreeOverviewDeps } from './worktree-overview-service'
import type { Project, AgentSession } from '../../shared/types'

function project(over: Partial<Project> = {}): Project {
  return { id: 'p1', name: 'manifold', path: '/repos/manifold', baseBranch: 'main', addedAt: '', kind: 'git', ...over }
}
function session(over: Partial<AgentSession> = {}): AgentSession {
  return { id: 's1', projectId: 'p1', runtimeId: 'claude', branchName: 'feat', worktreePath: '/wt/a', status: 'running', pid: 123, additionalDirs: [], ...over }
}

function deps(over: Partial<WorktreeOverviewDeps> = {}): WorktreeOverviewDeps {
  return {
    listProjects: () => [project()],
    listSessions: () => [],
    listWorktrees: async () => [{ branch: 'feat', path: '/wt/a' }],
    getAheadBehind: async () => ({ ahead: 0, behind: 0 }),
    getDirty: async () => false,
    getLastCommitISO: async () => '2026-06-10T12:00:00Z',
    readMeta: async () => ({ runtimeId: 'claude' }),
    removeWorktree: async () => {},
    pathExists: () => true,
    listMergedBranches: async () => [],
    listWorktreeBranches: async () => [],
    getBranchDates: async () => ({}),
    deleteMergedBranch: async () => {},
    ...over,
  }
}

describe('worktree-overview-service.list', () => {
  it('marks active when a live agent owns the worktree', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [session({ worktreePath: '/wt/a', pid: 123 })] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('active')
    expect(entry.sessionId).toBe('s1')
    expect(entry.projectName).toBe('manifold')
    expect(entry.branch).toBe('feat')
  })

  it('marks idle when managed but no live agent', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('idle')
    expect(entry.sessionId).toBeNull()
  })

  it('marks idle when a session exists but its process is dead (pid null)', async () => {
    const svc = createWorktreeOverviewService(deps({ listSessions: () => [session({ worktreePath: '/wt/a', pid: null })] }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('idle')
  })

  it('marks stale when the directory is gone and skips git calls', async () => {
    let gitCalled = false
    const svc = createWorktreeOverviewService(deps({
      pathExists: () => false,
      getAheadBehind: async () => { gitCalled = true; return { ahead: 1, behind: 0 } },
    }))
    const [entry] = await svc.list()
    expect(entry.status).toBe('stale')
    expect(entry.ahead).toBe(0)
    expect(entry.dirty).toBe(false)
    expect(gitCalled).toBe(false)
  })

  it('reads locked from worktree meta and ignores non-git projects', async () => {
    const svc = createWorktreeOverviewService(deps({
      listProjects: () => [project(), project({ id: 'p2', name: 'plain', path: '/repos/plain', kind: 'folder' })],
      readMeta: async () => ({ runtimeId: 'claude', locked: true }),
    }))
    const entries = await svc.list()
    expect(entries).toHaveLength(1)
    expect(entries[0].locked).toBe(true)
  })
})

describe('worktree-overview-service.remove', () => {
  it('refuses a dirty worktree without force', async () => {
    const svc = createWorktreeOverviewService(deps({ getDirty: async () => true }))
    await expect(svc.remove('/wt/a')).rejects.toThrow(/uncommitted or unpushed/)
  })

  it('refuses a worktree that is ahead of base without force', async () => {
    const svc = createWorktreeOverviewService(deps({ getAheadBehind: async () => ({ ahead: 2, behind: 0 }) }))
    await expect(svc.remove('/wt/a')).rejects.toThrow(/uncommitted or unpushed/)
  })

  it('removes a dirty worktree when force is set', async () => {
    let removed = ''
    const svc = createWorktreeOverviewService(deps({ getDirty: async () => true, removeWorktree: async (_p, wt) => { removed = wt } }))
    await svc.remove('/wt/a', { force: true })
    expect(removed).toBe('/wt/a')
  })

  it('refuses to remove a locked worktree even with force', async () => {
    const svc = createWorktreeOverviewService(deps({ readMeta: async () => ({ runtimeId: 'c', locked: true }) }))
    await expect(svc.remove('/wt/a', { force: true })).rejects.toThrow(/locked/)
  })

  it('removes a clean idle worktree directly', async () => {
    let removed = ''
    const svc = createWorktreeOverviewService(deps({ removeWorktree: async (_p, wt) => { removed = wt } }))
    await svc.remove('/wt/a')
    expect(removed).toBe('/wt/a')
  })

  it('throws when the worktree is not found in any project', async () => {
    const svc = createWorktreeOverviewService(deps({ listWorktrees: async () => [] }))
    await expect(svc.remove('/wt/missing')).rejects.toThrow(/not found/)
  })
})

describe('worktree-overview-service.pruneStale', () => {
  it('removes only dir-gone, unlocked worktrees and returns their paths', async () => {
    const removed: string[] = []
    const svc = createWorktreeOverviewService(deps({
      listWorktrees: async () => [
        { branch: 'gone', path: '/wt/gone' },
        { branch: 'live', path: '/wt/live' },
        { branch: 'locked', path: '/wt/locked' },
      ],
      pathExists: (p) => p === '/wt/live',
      readMeta: async (p) => (p === '/wt/locked' ? { runtimeId: 'c', locked: true } : { runtimeId: 'c' }),
      removeWorktree: async (_p, wt) => { removed.push(wt) },
    }))
    const result = await svc.pruneStale()
    expect(removed).toEqual(['/wt/gone'])
    expect(result).toEqual(['/wt/gone'])
  })
})

describe('worktree-overview-service.listMergedOrphanBranches', () => {
  it('returns merged branches with no worktree, excluding the base branch', async () => {
    const svc = createWorktreeOverviewService(deps({
      listMergedBranches: async () => ['main', 'feat/done', 'feat/active'],
      listWorktreeBranches: async () => ['main', 'feat/active'],
      getBranchDates: async () => ({ 'feat/done': '2026-03-15T00:00:00Z' }),
    }))
    const branches = await svc.listMergedOrphanBranches()
    expect(branches.map((b) => b.branch)).toEqual(['feat/done'])
    expect(branches[0].projectName).toBe('manifold')
    expect(branches[0].lastCommitISO).toBe('2026-03-15T00:00:00Z')
  })

  it('ignores non-git projects', async () => {
    const svc = createWorktreeOverviewService(deps({
      listProjects: () => [project({ id: 'p2', name: 'plain', path: '/repos/plain', kind: 'folder' })],
      listMergedBranches: async () => ['feat/x'],
      listWorktreeBranches: async () => [],
    }))
    expect(await svc.listMergedOrphanBranches()).toEqual([])
  })
})

describe('worktree-overview-service.deleteMergedBranch', () => {
  it('resolves the project by id and delegates to the safe git delete', async () => {
    let called: [string, string] | null = null
    const svc = createWorktreeOverviewService(deps({ deleteMergedBranch: async (p, b) => { called = [p, b] } }))
    await svc.deleteMergedBranch('p1', 'feat/done')
    expect(called).toEqual(['/repos/manifold', 'feat/done'])
  })

  it('throws when the project id is unknown', async () => {
    const svc = createWorktreeOverviewService(deps())
    await expect(svc.deleteMergedBranch('nope', 'feat/done')).rejects.toThrow(/project not found/)
  })

  it('propagates the git failure (e.g. branch not fully merged)', async () => {
    const svc = createWorktreeOverviewService(deps({ deleteMergedBranch: async () => { throw new Error('not fully merged') } }))
    await expect(svc.deleteMergedBranch('p1', 'feat/x')).rejects.toThrow(/not fully merged/)
  })
})
