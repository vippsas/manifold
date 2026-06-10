import { describe, it, expect, vi } from 'vitest'

const { removeWorktreeMeta } = vi.hoisted(() => ({
  removeWorktreeMeta: vi.fn(async () => undefined),
}))
vi.mock('../git/worktree-meta', () => ({ removeWorktreeMeta }))

import {
  buildWorkspaceWorkingSet,
  removeWorkspaceWorktrees,
  type WorkspaceProject,
  type WorktreeSetManager,
} from './workspace-worktrees'

function gitProject(id: string): WorkspaceProject {
  return { id, path: `/repo/${id}`, name: id, baseBranch: 'main', kind: 'git' }
}
function folderProject(id: string): WorkspaceProject {
  return { id, path: `/folder/${id}`, name: id, baseBranch: 'main', kind: 'folder' }
}

function makeManager(): WorktreeSetManager & {
  createWorktree: ReturnType<typeof vi.fn>
  removeWorktree: ReturnType<typeof vi.fn>
  deleteBranch: ReturnType<typeof vi.fn>
} {
  return {
    createWorktree: vi.fn(async (projectPath: string, _base: string, _name: string, branch?: string) => ({
      branch: branch ?? 'b', path: `${projectPath}/.wt/${branch}`,
    })),
    removeWorktree: vi.fn(async () => undefined),
    deleteBranch: vi.fn(async () => undefined),
    branchExists: vi.fn(async () => false),
  } as never
}

describe('buildWorkspaceWorkingSet', () => {
  it('creates a worktree per git repo; primary is the first project', async () => {
    const mgr = makeManager()
    const set = await buildWorkspaceWorkingSet(mgr, [gitProject('api'), gitProject('web')], 'manifold/x')
    expect(set.primary).toBe('/repo/api/.wt/manifold/x')
    expect(set.additionalDirs).toEqual(['/repo/web/.wt/manifold/x'])
    expect(set.worktreePaths).toEqual({
      api: '/repo/api/.wt/manifold/x',
      web: '/repo/web/.wt/manifold/x',
    })
  })

  it('passes non-git folders through as their own path', async () => {
    const mgr = makeManager()
    const set = await buildWorkspaceWorkingSet(mgr, [gitProject('api'), folderProject('docs')], 'manifold/x')
    expect(set.worktreePaths).toEqual({ api: '/repo/api/.wt/manifold/x', docs: '/folder/docs' })
    expect(mgr.createWorktree).toHaveBeenCalledTimes(1)
  })

  it('rolls back created worktrees and their branches if a later one fails', async () => {
    const mgr = makeManager()
    mgr.createWorktree
      .mockImplementationOnce(async () => ({ branch: 'manifold/x', path: '/repo/api/.wt/x' }))
      .mockImplementationOnce(async () => { throw new Error('boom') })
    await expect(buildWorkspaceWorkingSet(mgr, [gitProject('api'), gitProject('web')], 'manifold/x')).rejects.toThrow('boom')
    expect(mgr.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
    // removeWorktree keeps the branch, so rollback must delete it explicitly.
    expect(mgr.deleteBranch).toHaveBeenCalledWith('/repo/api', 'manifold/x')
  })
})

describe('removeWorkspaceWorktrees', () => {
  it('removes git worktrees and skips non-git passthrough paths', async () => {
    const mgr = makeManager()
    removeWorktreeMeta.mockClear()
    await removeWorkspaceWorktrees(
      mgr,
      { api: '/repo/api/.wt/x', docs: '/folder/docs' },
      (pid) => (pid === 'api' ? '/repo/api' : '/folder/docs'),
    )
    expect(mgr.removeWorktree).toHaveBeenCalledTimes(1)
    expect(mgr.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/x')
  })

  it('still drops the meta sidecar when a project was deregistered (unknown path)', async () => {
    const mgr = makeManager()
    removeWorktreeMeta.mockClear()
    await removeWorkspaceWorktrees(
      mgr,
      { api: '/repo/api/.wt/x' },
      () => undefined, // project deregistered — path unknown
    )
    // Can't run `git worktree remove` without the repo, but the sidecar must go
    // so re-adding the project can't resurrect the dead worktree.
    expect(mgr.removeWorktree).not.toHaveBeenCalled()
    expect(removeWorktreeMeta).toHaveBeenCalledWith('/repo/api/.wt/x')
  })
})
