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
import type { MemoryCapture } from '../memory/memory-capture'
import {
  createMockWorktreeManager,
  createMockPtyPool,
  createMockProjectRegistry,
} from './session-manager.test-helpers'

describe('SessionManager — kill / interrupt / resize', () => {
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

    it('does not remove worktree when another session still uses the same path', async () => {
      // Base session — owns the worktree.
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'base',
      })
      // Sibling session — joined the base's worktree (e.g. watch playlist sibling).
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'sibling',
        existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
      })

      // Closing the sibling tab must not remove the worktree —
      // the base agent still depends on it.
      await sessionManager.killSession('session-uuid-2')

      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
      expect(sessionManager.getSession('session-uuid-1')).toBeDefined()

      // Closing the base afterwards (last user of the path) removes the worktree.
      await sessionManager.killSession('session-uuid-1')
      expect(worktreeManager.removeWorktree).toHaveBeenCalledWith(
        '/repo',
        '/repo/.manifold/worktrees/manifold-oslo',
      )
    })

  })

  describe('interruptSession', () => {
    it('kills the pty for a running session', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      sessionManager.interruptSession('session-uuid-1')

      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      // Session itself is not removed — interrupt only kills the pty
      expect(sessionManager.getSession('session-uuid-1')).toBeDefined()
    })

    it('silently no-ops for unknown session', () => {
      expect(() => sessionManager.interruptSession('nope')).not.toThrow()
      expect(ptyPool.kill).not.toHaveBeenCalled()
    })

    it('silently no-ops for dormant session with no pty', async () => {
      ;(worktreeManager.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValue([
        { branch: 'manifold/bergen', path: '/repo/.manifold/worktrees/manifold-bergen' },
      ])

      const sessions = await sessionManager.discoverSessionsForProject('proj-1')
      const dormantId = sessions[0].id

      expect(() => sessionManager.interruptSession(dormantId)).not.toThrow()
      expect(ptyPool.kill).not.toHaveBeenCalled()
    })

    it('swallows errors thrown by ptyPool.kill (pty may have exited)', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      ;(ptyPool.kill as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('PTY not found')
      })

      expect(() => sessionManager.interruptSession('session-uuid-1')).not.toThrow()
    })
  })

  describe('resize', () => {
    it('forwards cols and rows to the session pty', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      sessionManager.resize('session-uuid-1', 132, 50)

      expect(ptyPool.resize).toHaveBeenCalledWith('pty-1', 132, 50)
    })

    it('silently no-ops for unknown session', () => {
      expect(() => sessionManager.resize('nope', 80, 24)).not.toThrow()
      expect(ptyPool.resize).not.toHaveBeenCalled()
    })

    it('swallows errors thrown by ptyPool.resize (pty may have exited)', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      ;(ptyPool.resize as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('PTY not found')
      })

      expect(() => sessionManager.resize('session-uuid-1', 80, 24)).not.toThrow()
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
})
