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
      deleteBranch: vi.fn(async () => undefined),
      branchExists: vi.fn(async () => false),
      createWorktreeFromBranch: vi.fn(async (p: string, _n: string, branch: string) => ({ branch, path: `${p}/.wt/${branch}` })),
    },
    projectRegistry: {
      getProject: (id: string) => projects[id],
      listProjects: () => Object.values(projects),
    },
    sessionManager: {
      createSession,
      getSession: vi.fn(),
      listSessions: vi.fn(() => []),
      killSession: vi.fn(async () => undefined),
      addWorkingDir: vi.fn(async () => undefined),
    },
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

  it('creates and lists a workspace', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    expect(w.id).toBe('uuid-1')
    expect(manager.list()).toHaveLength(1)
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('stores the chosen runtime on the workspace', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'], runtimeId: 'codex' })
    expect(manager.get(w.id)?.runtimeId).toBe('codex')
  })

  it('initial creation absorbs the selected one-folder home workspaces', async () => {
    const apiHome = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    const webHome = manager.adoptProject(deps.projectRegistry.getProject('web')!)

    const combined = await manager.create({
      name: 'auth',
      projectIds: ['api', 'web'],
      absorbHomeWorkspaces: true,
    })

    expect(manager.get(apiHome.id)).toBeUndefined()
    expect(manager.get(webHome.id)).toBeUndefined()
    expect(manager.list()).toEqual([combined])
  })

  it('initial creation preserves other worktree and multi-folder home workspaces', async () => {
    const multiFolderHome = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    await manager.addProject(multiFolderHome.id, 'shared')
    const parallel = await manager.create({ name: 'parallel', projectIds: ['web'] })

    await manager.create({
      name: 'auth',
      projectIds: ['api', 'web'],
      absorbHomeWorkspaces: true,
    })

    expect(manager.get(multiFolderHome.id)).toBeDefined()
    expect(manager.get(parallel.id)).toBeDefined()
  })

  it('initial creation preserves a home workspace that still owns an agent', async () => {
    const occupiedHome = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    deps.sessionManager.listSessions.mockReturnValue([{ workspaceId: occupiedHome.id }] as never)

    await manager.create({ name: 'auth', projectIds: ['api'], absorbHomeWorkspaces: true })

    expect(manager.get(occupiedHome.id)).toBeDefined()
  })

  it('copy creation preserves one-folder home workspaces', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('api')!)

    await manager.create({ name: 'parallel', projectIds: ['api'] })

    expect(manager.get(home.id)).toBeDefined()
  })

  it('create rejects an empty project list', async () => {
    await expect(manager.create({ name: 'x', projectIds: [] })).rejects.toThrow(/project/i)
  })

  // The workspace *is* the worktree: it owns one checkout of every repo from the
  // moment it exists, so it is never a name with nowhere to work.
  it('create cuts a checkout of every repo on one branch', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })

    expect(manager.get(w.id)?.branchName).toBe('manifold/auth')
    expect(manager.get(w.id)?.worktreePaths).toEqual({
      api: '/repo/api/.wt/manifold/auth',
      web: '/repo/web/.wt/manifold/auth',
    })
    expect(deps.worktreeManager.createWorktree).toHaveBeenCalledTimes(2)
  })

  it('create takes the next free branch so two workspaces can span the same repos', async () => {
    deps.worktreeManager.branchExists.mockImplementation(async (_p: string, b: string) => b === 'manifold/auth')

    const second = await manager.create({ name: 'auth', projectIds: ['api'] })

    expect(manager.get(second.id)?.branchName).toBe('manifold/auth-2')
  })

  // The point of the whole model: agents join the workspace's checkout instead of
  // stacking a worktree of their own inside it.
  it('spawnAgent reuses the workspace checkout instead of cutting another', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    deps.worktreeManager.createWorktree.mockClear()

    const session = await manager.spawnAgent(w.id, { runtimeId: 'claude' })

    expect(session.id).toBe('sess-1')
    expect(deps.worktreeManager.createWorktree).not.toHaveBeenCalled()
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'api',
      runtimeId: 'claude',
      branchName: 'manifold/auth',
      existingWorktreePath: '/repo/api/.wt/manifold/auth',
      additionalDirs: ['/repo/web/.wt/manifold/auth'],
      workspaceId: w.id,
      workspaceWorktreePaths: { api: '/repo/api/.wt/manifold/auth', web: '/repo/web/.wt/manifold/auth' },
    }))
  })

  it('two agents in one workspace work in the same checkout', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude' })
    await manager.spawnAgent(w.id, { runtimeId: 'codex' })

    const [first, second] = deps._createSession.mock.calls.map(([opts]) => opts.existingWorktreePath)
    expect(first).toBe(second)
  })

  // The workspace decides where its agents run, so every agent in it lands in the
  // same place: the workspace's first folder, with the rest along as context.
  // Nothing the user has selected elsewhere can move an agent to another folder.
  it('always homes the agent in the workspace first folder', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web', 'shared'] })

    await manager.spawnAgent(w.id, { runtimeId: 'claude' })

    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'api',
      existingWorktreePath: '/repo/api/.wt/manifold/auth',
      additionalDirs: ['/repo/web/.wt/manifold/auth', '/repo/shared/.wt/manifold/auth'],
    }))
  })

  it('names the agent when one is typed in the form', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })

    await manager.spawnAgent(w.id, { runtimeId: 'claude', displayName: 'reviewer' })

    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'reviewer' }))
  })

  // The home workspace is the clone the user opened, so its agents edit that —
  // on whatever branch it is already on, not one we move it to.
  it('an agent in a home workspace works in the repo itself', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('api')!)

    await manager.spawnAgent(home.id, { runtimeId: 'claude' })

    expect(deps.worktreeManager.createWorktree).not.toHaveBeenCalled()
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'api',
      noWorktree: true,
      stayOnBranch: true,
      branchName: undefined,
    }))
  })

  it('removeProject removes a repo when more than one remains', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.removeProject(w.id, 'api')
    expect(manager.get(w.id)?.projectIds).toEqual(['web'])
  })

  it('removeProject takes that repo’s checkout with it', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })

    await manager.removeProject(w.id, 'api')

    expect(deps.worktreeManager.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/manifold/auth')
    expect(manager.get(w.id)?.worktreePaths).toEqual({ web: '/repo/web/.wt/manifold/auth' })
  })

  it('addProject cuts the new repo a checkout on the workspace’s branch', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })

    await manager.addProject(w.id, 'web')

    expect(deps.worktreeManager.createWorktree).toHaveBeenCalledWith('/repo/web', 'main', 'web', 'manifold/auth')
    expect(manager.get(w.id)?.worktreePaths).toEqual({
      api: '/repo/api/.wt/manifold/auth',
      web: '/repo/web/.wt/manifold/auth',
    })
  })

  // Agents in the workspace are already running with a fixed set of --add-dir
  // flags; the new folder has to be pushed into them or they never see it.
  it('addProject hands the running agents the workspace’s checkout of the new repo', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })

    await manager.addProject(w.id, 'web')

    expect(deps.sessionManager.addWorkingDir).toHaveBeenCalledWith(w.id, 'web', '/repo/web/.wt/manifold/auth')
  })

  it('addProject hands a home workspace’s agents the clone itself', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('api')!)

    await manager.addProject(home.id, 'web')

    expect(deps.sessionManager.addWorkingDir).toHaveBeenCalledWith(home.id, 'web', '/repo/web')
  })

  it('addProject leaves a home workspace on the clones', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('api')!)

    await manager.addProject(home.id, 'web')

    expect(deps.worktreeManager.createWorktree).not.toHaveBeenCalled()
    expect(manager.get(home.id)?.worktreePaths).toBeUndefined()
  })

  // Unlike creation, which picks a free branch name, a repo joining a workspace
  // has to land on the branch the workspace already spans. A repo that already
  // carries that branch — a leftover from a workspace since removed — is checked
  // out on it; `worktree add -b` would fail and the add would do nothing at all.
  it('addProject checks the new repo out on the workspace’s branch when it already has one', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })
    deps.worktreeManager.branchExists.mockResolvedValue(true)

    await manager.addProject(w.id, 'web')

    expect(deps.worktreeManager.createWorktreeFromBranch).toHaveBeenCalledWith('/repo/web', 'web', 'manifold/auth', 'main')
    expect(manager.get(w.id)?.worktreePaths?.web).toBe('/repo/web/.wt/manifold/auth')
  })

  // Same rule as grouping at creation: without it the folder shows twice in the
  // sidebar — once in the workspace it joined, once in the card it came from.
  it('addProject absorbs the joining repo’s empty one-folder home workspace', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('web')!)
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })

    await manager.addProject(w.id, 'web')

    expect(manager.get(home.id)).toBeUndefined()
    expect(manager.get(w.id)?.projectIds).toEqual(['api', 'web'])
  })

  it('addProject preserves a home workspace that still owns an agent', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('web')!)
    deps.sessionManager.listSessions.mockReturnValue([{ workspaceId: home.id }] as never)
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })

    await manager.addProject(w.id, 'web')

    expect(manager.get(home.id)).toBeDefined()
  })

  it('removeProject refuses to empty a workspace (keeps the last repo)', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })
    await manager.removeProject(w.id, 'api')
    expect(manager.get(w.id)?.projectIds).toEqual(['api'])
  })

  it('remove deletes the workspace record', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api'] })
    expect(await manager.remove(w.id)).toBe(true)
    expect(manager.list()).toHaveLength(0)
  })

  // Deleting the workspace is the only thing that deletes its worktrees — closing
  // an agent must not, since its siblings work in the same place.
  it('remove takes the workspace’s checkouts with it', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })

    await manager.remove(w.id)

    expect(deps.worktreeManager.removeWorktree).toHaveBeenCalledWith('/repo/api', '/repo/api/.wt/manifold/auth')
    expect(deps.worktreeManager.removeWorktree).toHaveBeenCalledWith('/repo/web', '/repo/web/.wt/manifold/auth')
  })

  it('remove never touches a home workspace’s clones', async () => {
    const home = manager.adoptProject(deps.projectRegistry.getProject('api')!)

    await manager.remove(home.id)

    expect(deps.worktreeManager.removeWorktree).not.toHaveBeenCalled()
  })

  it('removeProjectFromAllWorkspaces removes the project from every workspace that references it', async () => {
    const a = await manager.create({ name: 'a', projectIds: ['api', 'web'] })
    const b = await manager.create({ name: 'b', projectIds: ['api', 'shared'] })
    await manager.removeProjectFromAllWorkspaces('api')
    expect(manager.get(a.id)?.projectIds).toEqual(['web'])
    expect(manager.get(b.id)?.projectIds).toEqual(['shared'])
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('removeProjectFromAllWorkspaces drops a workspace it empties — a folderless card can do nothing', async () => {
    const w = await manager.create({ name: 'a', projectIds: ['api'] })
    await manager.removeProjectFromAllWorkspaces('api')
    expect(manager.get(w.id)).toBeUndefined()
  })

  // A repo arrives with its own workspace on its clone: that is where work on the
  // folder you opened lands, and every later workspace is a worktree beside it.
  it('adoptProject wraps a loose repo in a home workspace of its own', () => {
    const w = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    expect(w.name).toBe('api')
    expect(w.projectIds).toEqual(['api'])
    expect(w.branchName).toBeUndefined()
    expect(w.worktreePaths).toBeUndefined()
    expect(manager.list()).toHaveLength(1)
  })

  it('adoptProject returns the existing workspace instead of creating a second one', async () => {
    const existing = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    const adopted = manager.adoptProject(deps.projectRegistry.getProject('api')!)
    expect(adopted.id).toBe(existing.id)
    expect(manager.list()).toHaveLength(1)
  })

  it('adoptOrphanProjects gives every unheld repo a one-folder workspace', async () => {
    await manager.create({ name: 'auth', projectIds: ['api'] })
    manager.adoptOrphanProjects()
    const byName = Object.fromEntries(manager.list().map((w) => [w.name, w.projectIds]))
    expect(byName).toEqual({ auth: ['api'], web: ['web'], shared: ['shared'] })
  })

  it('adoptOrphanProjects does nothing when every repo already lives in a workspace', async () => {
    await manager.create({ name: 'all', projectIds: ['api', 'web', 'shared'] })
    deps.emitListChanged.mockClear()
    manager.adoptOrphanProjects()
    expect(manager.list()).toHaveLength(1)
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  it('removeProjectFromAllWorkspaces does not emit when no workspace references the project', async () => {
    await manager.create({ name: 'a', projectIds: ['web'] })
    deps.emitListChanged.mockClear()
    await manager.removeProjectFromAllWorkspaces('api')
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  // Seeded through the store: a workspace naming a dead repo can only come from
  // an older install, since create resolves every project up front.
  it('pruneMissingProjects drops project ids that no longer resolve in the registry', () => {
    deps.store.add({
      id: 'w-old', name: 'a', projectIds: ['api', 'ghost'], createdAt: '2024-01-01',
      branchName: 'manifold/a',
      worktreePaths: { api: '/repo/api/.wt/manifold/a', ghost: '/gone/.wt/manifold/a' },
    })

    manager.pruneMissingProjects()

    expect(manager.get('w-old')?.projectIds).toEqual(['api'])
    expect(manager.get('w-old')?.worktreePaths).toEqual({ api: '/repo/api/.wt/manifold/a' })
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('pruneMissingProjects leaves clean workspaces untouched and does not emit', async () => {
    const w = await manager.create({ name: 'a', projectIds: ['api', 'web'] })
    deps.emitListChanged.mockClear()
    manager.pruneMissingProjects()
    expect(manager.get(w.id)?.projectIds).toEqual(['api', 'web'])
    expect(deps.emitListChanged).not.toHaveBeenCalled()
  })

  it('forwards nonInteractive to createSession', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.spawnAgent(w.id, { runtimeId: 'claude', nonInteractive: true })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      nonInteractive: true,
    }))
  })

  it('forwards the native Viola runtime as a chat session', async () => {
    const w = await manager.create({ name: 'auth', projectIds: ['api', 'web'] })
    await manager.spawnAgent(w.id, { runtimeId: 'viola', nonInteractive: true })
    expect(deps._createSession).toHaveBeenCalledWith(expect.objectContaining({
      runtimeId: 'viola',
      nonInteractive: true,
    }))
  })
})
