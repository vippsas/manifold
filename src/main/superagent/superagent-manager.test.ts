import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { SuperagentManager } from './superagent-manager'
import { SuperagentStore } from './superagent-store'
import { ApprovalBroker } from './approval-broker'

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto')
  let c = 0
  const randomUUID = () => `uuid-${++c}`
  return { ...actual, default: { ...actual, randomUUID }, randomUUID }
})

function makeDeps(tmpDir: string) {
  return {
    store: new SuperagentStore(path.join(tmpDir, 'superagents.json')),
    storageRoot: tmpDir,
    approvalBroker: new ApprovalBroker({ emit: vi.fn() }),
    worktreeManager: {
      createWorktree: vi.fn(async (projectPath: string, _baseBranch: string, _projectName: string, branchName?: string) => ({
        branch: branchName ?? 'manifold/test',
        path: `${projectPath}/.wt/${branchName ?? 'manifold-test'}`,
      })),
      createWorktreeFromBranch: vi.fn(async (projectPath: string, projectName: string, branch: string) => ({
        branch,
        path: `${projectPath}/.wt-restored/${projectName}/${branch.replace(/\//g, '-')}`,
      })),
      removeWorktree: vi.fn(async () => { /* noop */ }),
      branchExists: vi.fn(async () => false),
    } as any,
    projectRegistry: {
      getProject: vi.fn((id: string) => ({ id, name: id, path: `/r/${id}`, baseBranch: 'main', addedAt: '' })),
      listProjects: vi.fn(() => []),
    } as any,
    sessionManager: {
      getSession: vi.fn(),
      createSession: vi.fn(),
      setParentSuperagent: vi.fn(),
      killSession: vi.fn(),
      getOutputBuffer: vi.fn(() => ''),
      sendInput: vi.fn(),
    } as any,
    diffProvider: { getDiff: vi.fn(async () => '') } as any,
    ptyPool: {
      spawn: vi.fn(() => ({ id: 'pty-1', pid: 99 })),
      kill: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
    } as any,
    runtimes: { getRuntimeById: vi.fn(() => ({ id: 'claude', name: 'Claude', binary: 'claude', args: [], orchestratorCapable: true })) } as any,
    mcpBridge: { socketPath: '/tmp/test.sock' } as any,
    emitStatus: vi.fn(),
    emitListChanged: vi.fn(),
    emitChildSpawned: vi.fn(),
    emitOutput: vi.fn(),
  }
}

describe('SuperagentManager', () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let manager: SuperagentManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a superagent: store entry, coordination dir, PTY spawned', async () => {
    const s = await manager.create({
      name: 'n',
      taskDescription: 'd',
      runtimeId: 'claude',
      fleetProjectIds: ['p1'],
      initialPrompt: 'start',
    })
    expect(s.id).toBe('uuid-1')
    expect(s.runtimeId).toBe('claude')
    expect(s.pid).toBe(99)
    expect(fs.existsSync(s.coordinationPath)).toBe(true)
    expect(deps.ptyPool.spawn).toHaveBeenCalled()
    expect(deps.store.get('uuid-1')).toBeDefined()
  })

  it('create rejects empty fleet', async () => {
    await expect(
      manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: [], initialPrompt: 'x' }),
    ).rejects.toThrow(/fleet/i)
  })

  it('list returns superagents', async () => {
    await manager.create({ name: 'a', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    expect(manager.list()).toHaveLength(1)
  })

  it('kill tears down PTY and marks session done', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    await manager.kill(s.id)
    expect(deps.ptyPool.kill).toHaveBeenCalled()
    expect(deps.store.get(s.id)?.status).toBe('done')
  })

  it('setAutoApprove persists the flag', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    manager.setAutoApprove(s.id, true)
    expect(deps.store.get(s.id)?.autoApprove).toBe(true)
  })

  it('adds a repository to an existing fleet on the same superagent branch', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })

    const updated = await manager.addProjectToFleet(s.id, { projectId: 'p2' })

    expect(deps.worktreeManager.createWorktree).toHaveBeenCalledWith(
      '/r/p2',
      'main',
      'p2',
      s.branchName,
    )
    expect(updated.fleetProjectIds).toEqual(['p1', 'p2'])
    expect(updated.fleetWorktreePaths.p2).toBe('/r/p2/.wt/manifold/n')
    expect(deps.emitListChanged).toHaveBeenCalled()
  })

  it('reuses an existing branch when adding a repository to the fleet', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.worktreeManager.branchExists = vi.fn(async (projectPath: string, branch: string) => (
      projectPath === '/r/p2' && branch === s.branchName
    )) as any

    const updated = await manager.addProjectToFleet(s.id, { projectId: 'p2' })

    expect(deps.worktreeManager.createWorktreeFromBranch).toHaveBeenCalledWith(
      '/r/p2',
      'p2',
      s.branchName,
      'main',
    )
    expect(updated.fleetWorktreePaths.p2).toBe('/r/p2/.wt-restored/p2/manifold-n')
  })

  it('reuses a compatible existing session only when explicitly requested', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.sessionManager.getSession = vi.fn((id: string) => (
      id === 'standalone-1'
        ? {
            id,
            projectId: 'p2',
            branchName: s.branchName,
            worktreePath: '/r/p2/.wt/manifold/n',
            noWorktree: false,
          }
        : undefined
    )) as any

    const updated = await manager.addProjectToFleet(s.id, {
      projectId: 'p2',
      reuseSessionId: 'standalone-1',
    })

    expect(deps.sessionManager.setParentSuperagent).toHaveBeenCalledWith('standalone-1', s.id)
    expect(updated.childSessionIds).toContain('standalone-1')
  })

  it('rejects reusing a session on a different worktree', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.sessionManager.getSession = vi.fn((id: string) => (
      id === 'standalone-1'
        ? {
            id,
            projectId: 'p2',
            branchName: 'feature/elsewhere',
            worktreePath: '/r/p2/.wt/feature-elsewhere',
            noWorktree: false,
          }
        : undefined
    )) as any

    await expect(manager.addProjectToFleet(s.id, {
      projectId: 'p2',
      reuseSessionId: 'standalone-1',
    })).rejects.toThrow(/superagent worktree/i)
  })

  it('restores a missing fleet worktree before respawning a child', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.sessionManager.getSession = vi.fn(() => undefined) as any
    deps.sessionManager.createSession = vi.fn(async (opts: Record<string, unknown>) => ({
      id: 'child-1',
      projectId: 'p1',
      worktreePath: opts.existingWorktreePath,
    })) as any

    const result = await manager.spawnFleetAgent(s.id, 'p1')

    expect(result).toEqual({ id: 'child-1' })
    expect(deps.worktreeManager.createWorktreeFromBranch).toHaveBeenCalledWith(
      '/r/p1',
      'p1',
      s.branchName,
      'main',
    )
    expect(deps.sessionManager.createSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'p1',
      runtimeId: 'claude',
      existingWorktreePath: '/r/p1/.wt-restored/p1/manifold-n',
      parentSuperagentId: s.id,
    }))
    expect(deps.store.get(s.id)?.fleetWorktreePaths.p1).toBe('/r/p1/.wt-restored/p1/manifold-n')
  })
})

describe('SuperagentManager — derived status', () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let manager: SuperagentManager

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superagent-mgr-'))
    deps = makeDeps(tmpDir)
    manager = new SuperagentManager(deps)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('recomputes status to running when any child is running', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.store.update(s.id, { childSessionIds: ['c1'] })
    deps.sessionManager.getSession = vi.fn((id: string) => ({ id, status: 'running', parentSuperagentId: s.id })) as any
    manager.onChildStatusChange(s.id, 'c1', 'running')
    expect(deps.store.get(s.id)?.status).toBe('running')
  })

  it('marks superagent done when all children done', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.store.update(s.id, { childSessionIds: ['c1', 'c2'] })
    deps.sessionManager.getSession = vi.fn((id: string) => ({ id, status: 'done', parentSuperagentId: s.id })) as any
    manager.onChildStatusChange(s.id, 'c1', 'done')
    expect(deps.store.get(s.id)?.status).toBe('done')
  })

  it('marks superagent error when any child errors', async () => {
    const s = await manager.create({ name: 'n', taskDescription: 'd', runtimeId: 'claude', fleetProjectIds: ['p1'], initialPrompt: 'x' })
    deps.store.update(s.id, { childSessionIds: ['c1'] })
    deps.sessionManager.getSession = vi.fn(() => ({ id: 'c1', status: 'error', parentSuperagentId: s.id })) as any
    manager.onChildStatusChange(s.id, 'c1', 'error')
    expect(deps.store.get(s.id)?.status).toBe('error')
  })
})
