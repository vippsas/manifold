import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `session-uuid-${++uuidCounter}`),
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn((id: string) => {
    if (id === 'claude') {
      return { id: 'claude', name: 'Claude Code', binary: 'claude', args: ['--allow-dangerously-skip-permissions'], env: undefined }
    }
    if (id === 'codex') {
      return { id: 'codex', name: 'Codex', binary: 'codex', args: [], env: undefined }
    }
    return undefined
  }),
}))

vi.mock('../agent/status-detector', () => ({
  detectStatus: vi.fn(() => 'running'),
}))

vi.mock('../fs/add-dir-detector', () => ({
  detectAddDir: vi.fn((output: string) => {
    const match = output.match(/Added\s+(.+?)\s+as a working directory/)
    return match ? match[1].replace(/\/+$/, '') : null
  }),
}))

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue('main\n'),
}))

vi.mock('../git/managed-worktree', () => ({
  prepareManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

import { SessionManager } from './session-manager'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import { gitExec } from '../git/git-exec'
import type { MemoryCapture } from '../memory/memory-capture'
import {
  createMockWorktreeManager,
  createMockPtyPool,
  createMockProjectRegistry,
} from './session-manager.test-helpers'

describe('SessionManager — discovery / resume', () => {
  let worktreeManager: ReturnType<typeof createMockWorktreeManager>
  let ptyPool: ReturnType<typeof createMockPtyPool>
  let projectRegistry: ReturnType<typeof createMockProjectRegistry>
  let memoryCapture: Pick<MemoryCapture, 'startCapturing' | 'stopCapturing' | 'recordInput'>
  let sessionManager: SessionManager

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    uuidCounter = 0
    worktreeManager = createMockWorktreeManager()
    ptyPool = createMockPtyPool()
    projectRegistry = createMockProjectRegistry()
    memoryCapture = {
      startCapturing: vi.fn(),
      stopCapturing: vi.fn(),
      recordInput: vi.fn(),
    }
    sessionManager = new SessionManager(
      worktreeManager as unknown as WorktreeManager,
      ptyPool as unknown as PtyPool,
      projectRegistry as unknown as ProjectRegistry,
    )
    sessionManager.setMemoryCapture(memoryCapture as MemoryCapture)
  })

  afterEach(() => {
    vi.useRealTimers()
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

    it('returns no sessions for registered paths that are not git repositories', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('git worktree failed (code 128): fatal: not a git repository (or any of the parent directories): .git'),
      )

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')

      expect(sessions).toEqual([])
    })

    it('returns no sessions when git cannot spawn during discovery', async () => {
      const error = Object.assign(new Error('spawn git ENOENT'), {
        code: 'ENOENT',
        syscall: 'spawn git',
      })
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockRejectedValue(error)

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')

      expect(sessions).toEqual([])
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

    it('does not create duplicate sessions when called concurrently for noWorktree project', async () => {
      // Simulate a simple-mode project on a feature branch (no worktrees)
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(gitExec as ReturnType<typeof vi.fn>).mockResolvedValue('manifold/my-app\n')

      // Fire two concurrent discovery calls (simulates useAgentSession + useAdditionalDirs race)
      const [sessionsA, sessionsB] = await Promise.all([
        sessionManager.discoverSessionsForProject('proj-1'),
        sessionManager.discoverSessionsForProject('proj-1'),
      ])

      // Both should return the same single session — no duplicates
      expect(sessionsA).toHaveLength(1)
      expect(sessionsB).toHaveLength(1)
      expect(sessionsA[0].id).toBe(sessionsB[0].id)
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
        ['--allow-dangerously-skip-permissions'],
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

    it('concurrent resume calls spawn exactly one PTY and return the same session', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      const dormantId = sessions[0].id

      // Fire two resume calls simultaneously — neither has awaited yet so ptyId is still ''
      const [a, b] = await Promise.all([
        sessionManager.resumeSession(dormantId, 'claude'),
        sessionManager.resumeSession(dormantId, 'claude'),
      ])

      // Only one PTY must have been spawned
      expect(ptyPool.spawn).toHaveBeenCalledTimes(1)
      // Both callers must receive the same session
      expect(a.id).toBe(dormantId)
      expect(b.id).toBe(dormantId)
      expect(a.status).toBe('running')
      expect(b.status).toBe('running')
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
