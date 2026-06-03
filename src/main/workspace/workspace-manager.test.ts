import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { WorkspaceManager } from './workspace-manager'
import { WorkspaceStore } from './workspace-store'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  let c = 0
  const randomUUID = () => `uuid-${++c}`
  return { ...actual, default: { ...actual, randomUUID }, randomUUID }
})

function makeDeps(tmpDir: string) {
  const projects: Record<string, { id: string; name: string; path: string; baseBranch: string; kind: 'git' }> = {
    api: { id: 'api', name: 'api', path: '/repo/api', baseBranch: 'main', kind: 'git' },
    web: { id: 'web', name: 'web', path: '/repo/web', baseBranch: 'main', kind: 'git' },
    shared: { id: 'shared', name: 'shared', path: '/repo/shared', baseBranch: 'main', kind: 'git' },
  }
  const createSession = vi.fn(async (opts: Record<string, unknown>) => ({ id: 'sess-1', ...opts }))
  return {
    store: new WorkspaceStore(path.join(tmpDir, 'workspaces.json')),
    worktreeManager: {
      createWorktree: vi.fn(async (p: string, _b: string, _n: string, branch?: string) => ({ branch: branch ?? 'b', path: `${p}/.wt/${branch}` })),
      removeWorktree: vi.fn(async () => undefined),
      branchExists: vi.fn(async () => false),
    },
    projectRegistry: { getProject: (id: string) => projects[id] },
    sessionManager: { createSession, getSession: vi.fn(), killSession: vi.fn(async () => undefined) },
    emitListChanged: vi.fn(),
    _createSession: createSession,
  }
}

describe('WorkspaceManager', () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let manager: WorkspaceManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new WorkspaceManager(deps as never)
  })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  it('creates and lists a workspace', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    expect(w.id).toBe('uuid-1')
    expect(manager.list()).toHaveLength(1)
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('stores the chosen runtime on the workspace', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'], runtimeId: 'codex' })
    expect(manager.get(w.id)?.runtimeId).toBe('codex')
  })

  it('create rejects an empty project list', () => {
    expect(() => manager.create({ name: 'x', projectIds: [] })).toThrow(/project/i)
  })

  it('spawnAgent creates worktrees and a session with the working set', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    const session = await manager.spawnAgent(w.id, { runtimeId: 'claude' })
    expect(session.id).toBe('sess-1')
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'api',
      runtimeId: 'claude',
      existingWorktreePath: '/repo/api/.wt/manifold/auth',
      additionalDirs: ['/repo/web/.wt/manifold/auth'],
      workspaceId: w.id,
      workspaceWorktreePaths: { api: '/repo/api/.wt/manifold/auth', web: '/repo/web/.wt/manifold/auth' },
    }))
  })

  it('spawnAgent homes the agent in the chosen repo while still spanning the others', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude', homeProjectId: 'web' })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'web',
      existingWorktreePath: '/repo/web/.wt/manifold/auth',
      additionalDirs: ['/repo/api/.wt/manifold/auth'],
    }))
  })

  it('keeps the other repos in their original order when the home repo is in the middle', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web', 'shared'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude', homeProjectId: 'web' })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'web',
      existingWorktreePath: '/repo/web/.wt/manifold/auth',
      // api stays before shared; only web is pulled to the front
      additionalDirs: ['/repo/api/.wt/manifold/auth', '/repo/shared/.wt/manifold/auth'],
    }))
  })

  it('removeProject removes a repo when more than one remains', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    manager.removeProject(w.id, 'api')
    expect(manager.get(w.id)?.projectIds).toEqual(['web'])
  })

  it('removeProject refuses to empty a workspace (keeps the last repo)', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api'] })
    manager.removeProject(w.id, 'api')
    expect(manager.get(w.id)?.projectIds).toEqual(['api'])
  })

  it('remove deletes the workspace record', () => {
    const w = manager.create({ name: 'auth', projectIds: ['api'] })
    expect(manager.remove(w.id)).toBe(true)
    expect(manager.list()).toHaveLength(0)
  })

  it('forwards nonInteractive to createSession', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude', nonInteractive: true })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      nonInteractive: true,
    }))
  })
})
