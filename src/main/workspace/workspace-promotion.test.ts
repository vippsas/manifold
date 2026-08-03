import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { promoteAgentWorktreesToWorkspaces } from './workspace-promotion'
import { WorkspaceStore } from './workspace-store'
import { writeWorktreeMeta } from '../git/worktree-meta'

const projects = [
  { id: 'api', name: 'api', path: '/repo/api', baseBranch: 'main', kind: 'git' as const, addedAt: '' },
  { id: 'web', name: 'web', path: '/repo/web', baseBranch: 'main', kind: 'git' as const, addedAt: '' },
  { id: 'docs', name: 'docs', path: '/folder/docs', baseBranch: 'main', kind: 'folder' as const, addedAt: '' },
]

describe('promoteAgentWorktreesToWorkspaces', () => {
  let tmpDir: string
  let store: WorkspaceStore
  let worktreesByRepo: Record<string, { branch: string; path: string }[]>

  // The meta sidecar lives beside the worktree, so worktree paths point into tmp.
  const wt = (name: string): string => path.join(tmpDir, name)

  const promote = () => promoteAgentWorktreesToWorkspaces({
    store,
    projectRegistry: { listProjects: () => projects },
    worktreeManager: { listWorktrees: async (p: string) => worktreesByRepo[p] ?? [] },
  })

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promote-'))
    store = new WorkspaceStore(path.join(tmpDir, 'workspaces.json'))
    worktreesByRepo = {}
  })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('turns a single-repo agent worktree into a workspace named after its branch', async () => {
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/oslo', path: wt('oslo') }]

    const [workspace] = await promote()

    expect(workspace.name).toBe('oslo')
    expect(workspace.branchName).toBe('manifold/oslo')
    expect(workspace.projectIds).toEqual(['api'])
    expect(workspace.worktreePaths).toEqual({ api: wt('oslo') })
  })

  // Only the agent's primary worktree carries a sidecar, and that is the one
  // naming the whole set — the other repos' worktrees are reached through it.
  it('turns a multi-repo agent’s whole set into one workspace', async () => {
    await writeWorktreeMeta(wt('api-bergen'), {
      runtimeId: 'claude',
      workspaceWorktreePaths: { api: wt('api-bergen'), web: wt('web-bergen') },
    })
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/bergen', path: wt('api-bergen') }]

    const promoted = await promote()

    expect(promoted).toHaveLength(1)
    expect(promoted[0].projectIds).toEqual(['api', 'web'])
    expect(promoted[0].worktreePaths).toEqual({ api: wt('api-bergen'), web: wt('web-bergen') })
  })

  // Promotion gives every repo in the set a sidecar, so the next start finds
  // worktrees it did not see before — they must not become a second workspace.
  it('does not re-promote the sibling repos it just gave sidecars to', async () => {
    await writeWorktreeMeta(wt('api-bergen'), {
      runtimeId: 'claude',
      workspaceWorktreePaths: { api: wt('api-bergen'), web: wt('web-bergen') },
    })
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/bergen', path: wt('api-bergen') }]

    await promote()
    worktreesByRepo['/repo/web'] = [{ branch: 'manifold/bergen', path: wt('web-bergen') }]

    expect(await promote()).toEqual([])
    expect(store.list()).toHaveLength(1)
  })

  it('gives each of one repo’s worktrees its own workspace', async () => {
    worktreesByRepo['/repo/api'] = [
      { branch: 'manifold/oslo', path: wt('oslo') },
      { branch: 'manifold/tromso', path: wt('tromso') },
    ]

    const promoted = await promote()

    expect(promoted.map((w) => w.name).sort()).toEqual(['oslo', 'tromso'])
  })

  // Discovery reads workspaceId off the sidecar, so an agent restored from a
  // promoted worktree has to come back inside the workspace it now belongs to.
  it('points the promoted worktree’s metadata at its new workspace', async () => {
    await writeWorktreeMeta(wt('oslo'), { runtimeId: 'claude', sessionId: 's1' })
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/oslo', path: wt('oslo') }]

    const [workspace] = await promote()

    const meta = JSON.parse(fs.readFileSync(wt('oslo') + '.manifold.json', 'utf-8'))
    expect(meta).toMatchObject({ sessionId: 's1', workspaceId: workspace.id })
    expect(meta.workspaceWorktreePaths).toEqual({ api: wt('oslo') })
  })

  it('promotes nothing on a second pass', async () => {
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/oslo', path: wt('oslo') }]

    await promote()
    const second = await promote()

    expect(second).toEqual([])
    expect(store.list()).toHaveLength(1)
  })

  it('leaves a workspace’s own checkouts alone', async () => {
    store.add({
      id: 'w1', name: 'auth', projectIds: ['api'], createdAt: '2026-01-01',
      branchName: 'manifold/auth', worktreePaths: { api: wt('auth') },
    })
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/auth', path: wt('auth') }]

    expect(await promote()).toEqual([])
  })

  it('drops repos that are no longer registered from a promoted set', async () => {
    await writeWorktreeMeta(wt('api-bergen'), {
      runtimeId: 'claude',
      workspaceWorktreePaths: { api: wt('api-bergen'), gone: wt('gone-bergen') },
    })
    worktreesByRepo['/repo/api'] = [{ branch: 'manifold/bergen', path: wt('api-bergen') }]

    const [workspace] = await promote()

    expect(workspace.projectIds).toEqual(['api'])
  })

  it('ignores a repo whose worktrees cannot be listed', async () => {
    const promoted = await promoteAgentWorktreesToWorkspaces({
      store,
      projectRegistry: { listProjects: () => projects },
      worktreeManager: { listWorktrees: async () => { throw new Error('not a repo') } },
    })

    expect(promoted).toEqual([])
  })
})
