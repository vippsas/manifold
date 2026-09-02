import { describe, it, expect, vi } from 'vitest'
import { createAgentSpawnService } from './agent-spawn-service'

function fakeSm(overrides: Record<string, unknown> = {}): {
  createSession: ReturnType<typeof vi.fn>
  killSession: ReturnType<typeof vi.fn>
  sendInput: ReturnType<typeof vi.fn>
  getSession: ReturnType<typeof vi.fn>
} {
  return {
    createSession: vi.fn(async (opts: unknown) => {
      const options = opts as { existingWorktreePath?: string }
      return { id: 'sib-1', worktreePath: options.existingWorktreePath, ...(opts as object) }
    }),
    killSession: vi.fn(async () => undefined),
    sendInput: vi.fn(),
    getSession: vi.fn(() => ({
      id: 'base-1', projectId: 'p1', runtimeId: 'claude',
      worktreePath: '/wt/base', status: 'waiting',
    })),
    ...overrides,
  }
}

describe('createAgentSpawnService', () => {
  it('spawnSibling derives project/runtime/worktree from the base session', async () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    const res = await svc.spawnSibling('base-1', { title: 'Watching: intro', groupId: 'run-1' })
    expect(res).toEqual({ sessionId: 'sib-1' })
    expect(sm.createSession).toHaveBeenCalledWith({
      projectId: 'p1', runtimeId: 'claude', prompt: 'Watching: intro',
      existingWorktreePath: '/wt/base', groupId: 'run-1',
    })
  })

  it('spawnAgent can select another runtime in a fresh managed worktree', async () => {
    const sm = fakeSm({
      createSession: vi.fn(async () => ({
        id: 'sib-2', runtimeId: 'codex', worktreePath: '/wt/task-2',
      })),
    })
    const resolveHead = vi.fn(async () => 'base-sha')
    const svc = createAgentSpawnService(sm as never, { resolveHead })

    await expect(svc.spawnAgent('base-1', {
      title: 'fix-auth', runtimeId: 'codex', newWorktree: true, nonInteractive: true,
    })).resolves.toEqual({
      sessionId: 'sib-2', runtimeId: 'codex', worktreePath: '/wt/task-2',
    })
    expect(sm.createSession).toHaveBeenCalledWith({
      projectId: 'p1', runtimeId: 'codex', prompt: 'fix-auth',
      existingWorktreePath: undefined, baseBranch: 'base-sha', groupId: undefined, nonInteractive: true,
      orchestratedBy: 'base-1',
    })
    expect(resolveHead).toHaveBeenCalledWith('/wt/base')
  })

  it('places a spawned agent in the base session\'s workspace so the dock knows it', async () => {
    // A session with no workspaceId is grouped only into *home* workspaces holding its project,
    // so a child of an agent in a worktree workspace would belong to none: the dock would not
    // list it, and would prune any tab opened for it.
    const sm = fakeSm({
      getSession: vi.fn(() => ({
        id: 'base-1', projectId: 'p1', runtimeId: 'claude', worktreePath: '/wt/base',
        status: 'waiting', workspaceId: 'ws-7',
      })),
      createSession: vi.fn(async () => ({ id: 'sib-3', runtimeId: 'codex', worktreePath: '/wt/task' })),
    })
    const svc = createAgentSpawnService(sm as never, { resolveHead: vi.fn(async () => 'base-sha') })

    await svc.spawnAgent('base-1', {
      title: 'fix-auth', runtimeId: 'codex', newWorktree: true, nonInteractive: false, groupId: 'viola-1',
    })

    expect(sm.createSession).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-7', groupId: 'viola-1',
    }))
  })

  it('omits the workspace when the base session has none', async () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)

    await svc.spawnSibling('base-1', { title: 'Watching: intro' })

    expect(sm.createSession).toHaveBeenCalledWith(expect.not.objectContaining({ workspaceId: expect.anything() }))
  })

  it('spawnSibling rejects when the base session does not exist', async () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never)
    await expect(svc.spawnSibling('nope')).rejects.toThrow('no session nope')
  })

  it('sendText passes raw input through to the session manager', () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    svc.sendText('sib-1', '/watch:watch "/work" question')
    expect(sm.sendInput).toHaveBeenCalledWith('sib-1', '/watch:watch "/work" question')
  })

  it('whenReady resolves true once the session status is waiting', async () => {
    let calls = 0
    const sm = fakeSm({
      getSession: vi.fn(() => ({ status: ++calls >= 3 ? 'waiting' : 'running' })),
    })
    const svc = createAgentSpawnService(sm as never, { sleep: async () => undefined })
    await expect(svc.whenReady('sib-1', 30_000)).resolves.toBe(true)
    expect(calls).toBe(3)
  })

  it('whenReady resolves false on timeout', async () => {
    let t = 0
    const sm = fakeSm({ getSession: vi.fn(() => ({ status: 'running' })) })
    const svc = createAgentSpawnService(sm as never, {
      sleep: async () => undefined,
      now: () => (t += 200),
    })
    await expect(svc.whenReady('sib-1', 1_000)).resolves.toBe(false)
  })

  it('whenReady resolves false when the session disappears', async () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never, { sleep: async () => undefined })
    await expect(svc.whenReady('gone', 1_000)).resolves.toBe(false)
  })

  it('getStatus maps a missing session to "missing"', () => {
    const sm = fakeSm({ getSession: vi.fn(() => undefined) })
    const svc = createAgentSpawnService(sm as never)
    expect(svc.getStatus('gone')).toBe('missing')
  })

  it('getStatus passes live statuses through', () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    expect(svc.getStatus('base-1')).toBe('waiting')
  })

  it('kill delegates to killSession', async () => {
    const sm = fakeSm()
    const svc = createAgentSpawnService(sm as never)
    await svc.kill('sib-1')
    expect(sm.killSession).toHaveBeenCalledWith('sib-1')
  })
})
