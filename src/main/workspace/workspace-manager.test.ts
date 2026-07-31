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
    projectRegistry: {
      getProject: (id: string) => projects[id],
      listProjects: () => Object.values(projects),
    },
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

  it('removeProjectFromAllWorkspaces removes the project from every workspace that references it', () => {
    const a = manager.create({ name: 'a', projectIds: ['api', 'web'] })
    const b = manager.create({ name: 'b', projectIds: ['api', 'shared'] })
    manager.removeProjectFromAllWorkspaces('api')
    expect(manager.get(a.id)?.projectIds).toEqual(['web'])
    expect(manager.get(b.id)?.projectIds).toEqual(['shared'])
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('removeProjectFromAllWorkspaces drops a workspace it empties — a folderless card can do nothing', () => {
    const w = manager.create({ name: 'a', projectIds: ['api'] })
    manager.removeProjectFromAllWorkspaces('api')
    expect(manager.get(w.id)).toBeUndefined()
  })

  it('adoptProject wraps a loose repo in a workspace of its own', () => {
    const w = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    expect(w.name).toBe('api')
    expect(w.projectIds).toEqual(['api'])
    expect(manager.list()).toHaveLength(1)
  })

  it('adoptProject returns the existing workspace instead of creating a second one', () => {
    const existing = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    const adopted = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    expect(adopted.id).toBe(existing.id)
    expect(manager.list()).toHaveLength(1)
  })

  it('adoptOrphanProjects gives every unheld repo a one-folder workspace', () => {
    manager.create({ name: 'auth', projectIds: ['api'] })
    manager.adoptOrphanProjects()
    const byName = Object.fromEntries(manager.list().map((w) => [w.name, w.projectIds]))
    expect(byName).toEqual({ auth: ['api'], web: ['web'], shared: ['shared'] })
  })

  it('adoptOrphanProjects does nothing when every repo already lives in a workspace', () => {
    manager.create({ name: 'all', projectIds: ['api', 'web', 'shared'] })
    deps.emitListChanged.mockClear()
    manager.adoptOrphanProjects()
    expect(manager.list()).toHaveLength(1)
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  it('removeProjectFromAllWorkspaces does not emit when no workspace references the project', () => {
    manager.create({ name: 'a', projectIds: ['web'] })
    deps.emitListChanged.mockClear()
    manager.removeProjectFromAllWorkspaces('api')
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  it('pruneMissingProjects drops project ids that no longer resolve in the registry', () => {
    const w = manager.create({ name: 'a', projectIds: ['api', 'ghost'] })
    manager.pruneMissingProjects()
    expect(manager.get(w.id)?.projectIds).toEqual(['api'])
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('pruneMissingProjects leaves clean workspaces untouched and does not emit', () => {
    const w = manager.create({ name: 'a', projectIds: ['api', 'web'] })
    deps.emitListChanged.mockClear()
    manager.pruneMissingProjects()
    expect(manager.get(w.id)?.projectIds).toEqual(['api', 'web'])
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  it('forwards nonInteractive to createSession', async () => {
    const w = manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude', nonInteractive: true })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      nonInteractive: true,
    }))
  })
})
