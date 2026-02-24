import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `session-uuid-${++uuidCounter}`),
}))

vi.mock('./runtimes', () => ({
  getRuntimeById: vi.fn((id: string) => {
    if (id === 'claude') {
      return {
        id: 'claude',
        name: 'Claude Code',
        binary: 'claude',
        args: ['--dangerously-skip-permissions'],
        env: undefined,
      }
    }
    return undefined
  }),
}))

vi.mock('./status-detector', () => ({
  detectStatus: vi.fn(() => 'running'),
}))

import { SessionManager } from './session-manager'
import { WorktreeManager } from './worktree-manager'
import { PtyPool } from './pty-pool'
import { ProjectRegistry } from './project-registry'
import { getRuntimeById } from './runtimes'
import type { BrowserWindow } from 'electron'

function createMockWorktreeManager() {
  return {
    createWorktree: vi.fn().mockResolvedValue({
      branch: 'manifold/oslo',
      path: '/repo/.manifold/worktrees/manifold-oslo',
    }),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    listWorktrees: vi.fn().mockResolvedValue([]),
  } as unknown as WorktreeManager
}

function createMockPtyPool() {
  return {
    spawn: vi.fn().mockReturnValue({ id: 'pty-1', pid: 999 }),
    write: vi.fn(),
    kill: vi.fn(),
    resize: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    killAll: vi.fn(),
    getActivePtyIds: vi.fn().mockReturnValue([]),
  } as unknown as PtyPool
}

function createMockProjectRegistry() {
  return {
    getProject: vi.fn((id: string) => {
      if (id === 'proj-1') {
        return { id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '2024-01-01' }
      }
      return undefined
    }),
    listProjects: vi.fn().mockReturnValue([]),
    addProject: vi.fn(),
    removeProject: vi.fn(),
  } as unknown as ProjectRegistry
}

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow
}

describe('SessionManager', () => {
  let worktreeManager: ReturnType<typeof createMockWorktreeManager>
  let ptyPool: ReturnType<typeof createMockPtyPool>
  let projectRegistry: ReturnType<typeof createMockProjectRegistry>
  let sessionManager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    uuidCounter = 0
    worktreeManager = createMockWorktreeManager()
    ptyPool = createMockPtyPool()
    projectRegistry = createMockProjectRegistry()
    sessionManager = new SessionManager(
      worktreeManager as unknown as WorktreeManager,
      ptyPool as unknown as PtyPool,
      projectRegistry as unknown as ProjectRegistry,
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createSession', () => {
    it('creates a session with worktree and pty', async () => {
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'do something',
      })

      expect(session.id).toBe('session-uuid-1')
      expect(session.projectId).toBe('proj-1')
      expect(session.runtimeId).toBe('claude')
      expect(session.branchName).toBe('manifold/oslo')
      expect(session.status).toBe('running')
      expect(session.pid).toBe(999)

      expect(worktreeManager.createWorktree).toHaveBeenCalledWith('/repo', 'main', 'test', undefined, 'do something')
      expect(ptyPool.spawn).toHaveBeenCalledWith(
        'claude',
        ['--dangerously-skip-permissions'],
        { cwd: '/repo/.manifold/worktrees/manifold-oslo', env: undefined },
      )
      expect(ptyPool.onData).toHaveBeenCalledWith('pty-1', expect.any(Function))
      expect(ptyPool.onExit).toHaveBeenCalledWith('pty-1', expect.any(Function))
    })

    it('throws when project is not found', async () => {
      await expect(
        sessionManager.createSession({
          projectId: 'non-existent',
          runtimeId: 'claude',
          prompt: 'test',
        }),
      ).rejects.toThrow('Project not found')
    })

    it('throws when runtime is not found', async () => {
      await expect(
        sessionManager.createSession({
          projectId: 'proj-1',
          runtimeId: 'unknown-runtime',
          prompt: 'test',
        }),
      ).rejects.toThrow('Runtime not found')
    })

    it('does not auto-write prompt to pty', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'hello world',
      })

      expect(ptyPool.write).not.toHaveBeenCalled()
    })

    it('passes custom branch name to worktree manager', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
        branchName: 'manifold/custom',
      })

      expect(worktreeManager.createWorktree).toHaveBeenCalledWith('/repo', 'main', 'test', 'manifold/custom', 'test')
    })
  })

  describe('sendInput', () => {
    it('writes input to the session pty', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      sessionManager.sendInput('session-uuid-1', 'some input')
      expect(ptyPool.write).toHaveBeenCalledWith('pty-1', 'some input')
    })

    it('throws for unknown session', () => {
      expect(() => sessionManager.sendInput('nope', 'data')).toThrow('Session not found')
    })

    it('silently ignores input for dormant sessions without a PTY', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      const dormantId = sessions[0].id

      // Should not throw
      sessionManager.sendInput(dormantId, 'hello')
      expect(ptyPool.write).not.toHaveBeenCalled()
    })
  })

  describe('killSession', () => {
    it('kills the pty and removes the worktree', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      await sessionManager.killSession('session-uuid-1')

      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        '/repo',
        '/repo/.manifold/worktrees/manifold-oslo',
      )
      expect(sessionManager.getSession('session-uuid-1')).toBeUndefined()
    })

    it('throws for unknown session', async () => {
      await expect(sessionManager.killSession('nope')).rejects.toThrow('Session not found')
    })

    it('still removes session even if worktree cleanup fails', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      ;(worktreeManager.removeWorktree as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('cleanup failed'),
      )

      await sessionManager.killSession('session-uuid-1')
      expect(sessionManager.getSession('session-uuid-1')).toBeUndefined()
    })
  })

  describe('getSession', () => {
    it('returns the public session info', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const session = sessionManager.getSession('session-uuid-1')
      expect(session).toBeDefined()
      expect(session!.id).toBe('session-uuid-1')
      // Should not expose internal fields
      expect((session as Record<string, unknown>)['ptyId']).toBeUndefined()
      expect((session as Record<string, unknown>)['outputBuffer']).toBeUndefined()
    })

    it('returns undefined for unknown session', () => {
      expect(sessionManager.getSession('nope')).toBeUndefined()
    })
  })

  describe('listSessions', () => {
    it('returns all sessions', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const sessions = sessionManager.listSessions()
      expect(sessions).toHaveLength(1)
      expect(sessions[0].id).toBe('session-uuid-1')
    })

    it('returns empty array initially', () => {
      expect(sessionManager.listSessions()).toEqual([])
    })
  })

  describe('killAllSessions', () => {
    it('kills all ptys and clears sessions', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      sessionManager.killAllSessions()
      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      expect(sessionManager.listSessions()).toEqual([])
    })
  })

  describe('setMainWindow', () => {
    it('sends status updates to renderer on data events', async () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      // Get the onData callback that was registered
      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void

      dataCallback('some output data')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'agent:output',
        { sessionId: 'session-uuid-1', data: 'some output data' },
      )
    })
  })

  describe('createShellSession', () => {
    it('spawns a shell pty and returns a session id', () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      const shellSession = sessionManager.createShellSession('/some/cwd')

      expect(shellSession).toEqual({ sessionId: 'session-uuid-1' })
      expect(ptyPool.spawn).toHaveBeenCalledWith(
        process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/zsh',
        [],
        expect.objectContaining({ cwd: '/some/cwd' }),
      )
      expect(ptyPool.onData).toHaveBeenCalledWith('pty-1', expect.any(Function))
      expect(ptyPool.onExit).toHaveBeenCalledWith('pty-1', expect.any(Function))
    })

    it('streams output to renderer via agent:output', () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      sessionManager.createShellSession('/some/cwd')

      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void
      dataCallback('shell output')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'agent:output',
        { sessionId: 'session-uuid-1', data: 'shell output' },
      )
    })

    it('supports sendInput on shell sessions', () => {
      sessionManager.createShellSession('/some/cwd')

      sessionManager.sendInput('session-uuid-1', 'ls\n')
      expect(ptyPool.write).toHaveBeenCalledWith('pty-1', 'ls\n')
    })

    it('supports resize on shell sessions', () => {
      sessionManager.createShellSession('/some/cwd')

      sessionManager.resize('session-uuid-1', 120, 40)
      expect(ptyPool.resize).toHaveBeenCalledWith('pty-1', 120, 40)
    })

    it('killSession works on shell sessions without worktree removal', async () => {
      sessionManager.createShellSession('/some/cwd')

      await sessionManager.killSession('session-uuid-1')

      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
      expect(sessionManager.getSession('session-uuid-1')).toBeUndefined()
    })
  })

  describe('discoverSessionsForProject', () => {
    it('returns dormant sessions for worktrees not tracked in memory', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
        { branch: 'manifold/oslo', path: '/repo/.manifold/worktrees/manifold-oslo' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')

      expect(sessions).toHaveLength(2)
      expect(sessions[0].branchName).toBe('manifold/bergen')
      expect(sessions[0].worktreePath).toBe('/repo/.manifold/worktrees/manifold-bergen')
      expect(sessions[0].status).toBe('done')
      expect(sessions[0].pid).toBeNull()
      expect(sessions[0].projectId).toBe('proj-1')
      expect(sessions[1].branchName).toBe('manifold/oslo')
    })

    it('does not duplicate sessions already tracked in memory', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/oslo', path: '/repo/.manifold/worktrees/manifold-oslo' },
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')

      // manifold/oslo is already in memory, manifold/bergen is new
      expect(sessions).toHaveLength(2)
      const branches = sessions.map((s) => s.branchName).sort()
      expect(branches).toEqual(['manifold/bergen', 'manifold/oslo'])

      // The in-memory session should keep its running status
      const osloSession = sessions.find((s) => s.branchName === 'manifold/oslo')!
      expect(osloSession.status).toBe('running')
      expect(osloSession.pid).toBe(999)

      // The discovered session should be dormant
      const bergenSession = sessions.find((s) => s.branchName === 'manifold/bergen')!
      expect(bergenSession.status).toBe('done')
      expect(bergenSession.pid).toBeNull()
    })

    it('returns stable IDs for discovered sessions across calls', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const first = await sessionManager.discoverSessionsForProject('proj-1')
      const second = await sessionManager.discoverSessionsForProject('proj-1')

      expect(first[0].id).toBe(second[0].id)
    })

    it('throws for unknown project', async () => {
      await expect(sessionManager.discoverSessionsForProject('nope')).rejects.toThrow(
        'Project not found',
      )
    })

    it('returns empty array when no worktrees exist', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      expect(sessions).toEqual([])
    })
  })

  describe('resumeSession', () => {
    it('spawns a PTY for a dormant session in its existing worktree', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      const dormantId = sessions[0].id

      const resumed = await sessionManager.resumeSession(dormantId, 'claude')

      expect(resumed.status).toBe('running')
      expect(resumed.pid).toBe(999)
      expect(resumed.runtimeId).toBe('claude')
      expect(ptyPool.spawn).toHaveBeenCalledWith(
        'claude',
        ['--dangerously-skip-permissions'],
        { cwd: '/repo/.manifold/worktrees/manifold-bergen', env: undefined },
      )
      expect(ptyPool.onData).toHaveBeenCalledWith('pty-1', expect.any(Function))
      expect(ptyPool.onExit).toHaveBeenCalledWith('pty-1', expect.any(Function))
    })

    it('returns existing session if already running', async () => {
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const resumed = await sessionManager.resumeSession(session.id, 'claude')
      expect(resumed.id).toBe(session.id)
      // spawn should only have been called once (during createSession)
      expect(ptyPool.spawn).toHaveBeenCalledTimes(1)
    })

    it('throws for unknown session', async () => {
      await expect(sessionManager.resumeSession('nope', 'claude')).rejects.toThrow(
        'Session not found',
      )
    })

    it('throws for unknown runtime', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      await expect(sessionManager.resumeSession(sessions[0].id, 'unknown')).rejects.toThrow(
        'Runtime not found',
      )
    })
  })

  describe('killSession on dormant sessions', () => {
    it('removes worktree without killing pty for dormant sessions', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      const dormantId = sessions[0].id

      await sessionManager.killSession(dormantId)

      expect(ptyPool.kill).not.toHaveBeenCalled()
      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        '/repo',
        '/repo/.manifold/worktrees/manifold-bergen',
      )
      expect(sessionManager.getSession(dormantId)).toBeUndefined()
    })
  })
})
