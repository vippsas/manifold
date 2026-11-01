import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    gitExec: vi.fn(),
    gitStatus: vi.fn(),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

vi.mock('../git/git-exec', () => ({ gitExec: mocks.gitExec }))

vi.mock('../fs/file-watcher-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fs/file-watcher-utils')>()),
  gitStatus: mocks.gitStatus,
}))

describe('registerGitHandlers git:workspace-status', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  async function registerWithWorkspace(workspace: unknown, projects: Record<string, unknown>): Promise<(...args: unknown[]) => unknown> {
    const { registerGitHandlers } = await import('./git-handlers')
    registerGitHandlers({
      gitOps: {},
      sessionManager: {},
      projectRegistry: { getProject: vi.fn((id: string) => projects[id]) },
      workspaceManager: { get: vi.fn(() => workspace) },
    } as never)
    return mocks.handlers.get('git:workspace-status')!
  }

  it('reports each git repo checkout with its branch and parsed changes', async () => {
    mocks.gitExec.mockImplementation(async (args: string[]) => args[0] === 'rev-list' ? '2 3\n' : 'manifold/feature\n')
    mocks.gitStatus.mockResolvedValue(' M src/a.ts\n?? b.ts\n')
    const handler = await registerWithWorkspace(
      {
        id: 'ws-1',
        projectIds: ['p1', 'p2'],
        worktreePaths: { p1: '/worktrees/repo-one', p2: '/plain-folder' },
      },
      {
        p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' },
        p2: { id: 'p2', name: 'plain', path: '/plain-folder', kind: 'folder' },
      },
    )

    const result = await handler({}, 'ws-1')

    // The plain folder is skipped; the git repo answers from its worktree.
    expect(result).toEqual([
      {
        projectId: 'p1',
        projectName: 'repo-one',
        checkoutPath: '/worktrees/repo-one',
        branch: 'manifold/feature',
        upstreamAheadBehind: { behind: 2, ahead: 3 },
        staged: [],
        unstaged: [{ path: 'src/a.ts', type: 'modified' }],
        untracked: [{ path: 'b.ts', type: 'added' }],
      },
    ])
    expect(mocks.gitExec).toHaveBeenCalledWith(['rev-parse', '--abbrev-ref', 'HEAD'], '/worktrees/repo-one')
    expect(mocks.gitExec).toHaveBeenCalledWith(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], '/worktrees/repo-one')
    expect(mocks.gitStatus).toHaveBeenCalledWith('/worktrees/repo-one')
  })

  it('reads a home workspace from the clones themselves', async () => {
    mocks.gitExec.mockResolvedValue('main\n')
    mocks.gitStatus.mockResolvedValue('')
    const handler = await registerWithWorkspace(
      { id: 'ws-home', projectIds: ['p1'] },
      { p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' } },
    )

    const result = await handler({}, 'ws-home')

    expect(result).toEqual([
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: 'main', staged: [], unstaged: [], untracked: [] },
    ])
    expect(mocks.gitStatus).toHaveBeenCalledWith('/repos/repo-one')
  })

  it('returns an empty status for a repo whose git calls fail, not an error', async () => {
    mocks.gitExec.mockRejectedValue(new Error('no HEAD'))
    mocks.gitStatus.mockRejectedValue(new Error('timeout'))
    const handler = await registerWithWorkspace(
      { id: 'ws-1', projectIds: ['p1'] },
      { p1: { id: 'p1', name: 'repo-one', path: '/repos/repo-one', kind: 'git' } },
    )

    await expect(handler({}, 'ws-1')).resolves.toEqual([
      { projectId: 'p1', projectName: 'repo-one', checkoutPath: '/repos/repo-one', branch: '', staged: [], unstaged: [], untracked: [] },
    ])
  })

  it('returns [] for a missing workspace', async () => {
    const handler = await registerWithWorkspace(undefined, {})
    await expect(handler({}, 'gone')).resolves.toEqual([])
  })
})
