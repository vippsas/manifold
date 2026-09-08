import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => { handlers.set(channel, fn) }),
  }
})

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))

const verdict = (projectId: string, branch: string, outcome: string) => ({
  sessionId: `s-${branch}`, projectId, branch, runtime: 'claude',
  taskPrompt: { kind: 'full', text: '' }, outcome, createdAt: '',
  metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 1, removed: 0 }, filesChanged: 1 },
})

async function register(workspaces: unknown[], verdicts: unknown[]) {
  const { registerWorkspaceHandlers } = await import('./workspace-handlers')
  registerWorkspaceHandlers({
    workspaceManager: { list: vi.fn(() => workspaces) },
    activeWorkspaceStore: { get: vi.fn(), set: vi.fn() },
    verdictStore: { listAll: vi.fn(() => verdicts) },
  } as never)
  const handler = mocks.handlers.get('workspace:list-merged')
  if (!handler) throw new Error('workspace:list-merged not registered')
  return handler
}

describe('workspace:list-merged', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.handlers.clear() })

  it('returns worktree workspaces whose primary repo + branch has a merged verdict', async () => {
    const handler = await register(
      [
        { id: 'w-merged', name: 'a', projectIds: ['p1'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p1: '/wt' } },
        { id: 'w-open', name: 'b', projectIds: ['p1'], createdAt: '', branchName: 'kong/bergen', worktreePaths: { p1: '/wt2' } },
        { id: 'w-other-repo', name: 'c', projectIds: ['p2'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p2: '/wt3' } },
      ],
      [verdict('p1', 'kong/oslo', 'merged'), verdict('p1', 'kong/bergen', 'pr_created')],
    )
    expect(await handler({})).toEqual(['w-merged'])
  })

  // Only the recorder's activity-gated `merged` counts; prState alone does not.
  it('ignores every other outcome', async () => {
    const handler = await register(
      [{ id: 'w', name: 'a', projectIds: ['p1'], createdAt: '', branchName: 'kong/oslo', worktreePaths: { p1: '/wt' } }],
      [verdict('p1', 'kong/oslo', 'committed_only'), verdict('p1', 'kong/oslo', 'discarded')],
    )
    expect(await handler({})).toEqual([])
  })

  it('never reports a home workspace, which carries no branch of its own', async () => {
    const handler = await register(
      [{ id: 'w-home', name: 'kong', projectIds: ['p1'], createdAt: '' }],
      [verdict('p1', 'main', 'merged')],
    )
    expect(await handler({})).toEqual([])
  })
})
