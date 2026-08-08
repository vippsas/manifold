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
import type { FileWatcher } from '../fs/file-watcher'
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

  // A checkout belongs to the workspace that cut it, not to the agent that
  // happens to be working there — so closing agents never removes one, however
  // many or few are left. Only WorkspaceManager.remove does.
  describe('killSession', () => {
    it('kills the pty and leaves the checkout alone', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      await sessionManager.killSession('session-uuid-1')

      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
      expect(sessionManager.getSession('session-uuid-1')).toBeUndefined()
    })

    it('throws for unknown session', async () => {
      await expect(sessionManager.killSession('nope')).rejects.toThrow('Session not found')
    })

    it('keeps the checkout when the last agent working in it closes', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'base',
      })
      // Sibling agent — the same workspace checkout, which is now the norm
      // rather than a special case.
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'sibling',
        existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
      })

      await sessionManager.killSession('session-uuid-2')
      expect(sessionManager.getSession('session-uuid-1')).toBeDefined()

      await sessionManager.killSession('session-uuid-1')

      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
    })

    it('keeps every checkout of a workspace agent that spans several repos', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'workspace agent',
        existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
        workspaceId: 'w1',
        workspaceWorktreePaths: {
          'proj-1': '/repo/.manifold/worktrees/manifold-oslo',
          'proj-2': '/other/.manifold/worktrees/manifold-oslo',
        },
      })

      await sessionManager.killSession('session-uuid-1')

      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
    })
  })

  describe('killSession — file-watcher unwatch', () => {
    let fileWatcher: {
      watch: ReturnType<typeof vi.fn>
      watchAdditionalDir: ReturnType<typeof vi.fn>
      unwatch: ReturnType<typeof vi.fn>
      unwatchAdditionalDir: ReturnType<typeof vi.fn>
      setOnBranchChanged: ReturnType<typeof vi.fn>
    }
    let sm: SessionManager

    beforeEach(() => {
      fileWatcher = {
        watch: vi.fn(),
        watchAdditionalDir: vi.fn(),
        unwatch: vi.fn().mockResolvedValue(undefined),
        unwatchAdditionalDir: vi.fn(),
        setOnBranchChanged: vi.fn(),
      }
      sm = new SessionManager(
        worktreeManager as unknown as WorktreeManager,
        ptyPool as unknown as PtyPool,
        projectRegistry as unknown as ProjectRegistry,
        undefined,
        fileWatcher as unknown as FileWatcher,
      )
    })

    it('unwatches the worktree poll when the last session on the path is killed', async () => {
      await sm.createSession({ projectId: 'proj-1', runtimeId: 'claude', prompt: 'only' })

      await sm.killSession('session-uuid-1')

      expect(fileWatcher.unwatch).toHaveBeenCalledWith('/repo/.manifold/worktrees/manifold-oslo')
    })

    it('does not unwatch while another session still shares the worktree', async () => {
      await sm.createSession({ projectId: 'proj-1', runtimeId: 'claude', prompt: 'base' })
      await sm.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'sibling',
        existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
      })

      // Killing the sibling must keep the survivor's poll alive (#534).
      await sm.killSession('session-uuid-2')
      expect(fileWatcher.unwatch).not.toHaveBeenCalled()

      // Killing the last user finally unwatches (#493).
      await sm.killSession('session-uuid-1')
      expect(fileWatcher.unwatch).toHaveBeenCalledWith('/repo/.manifold/worktrees/manifold-oslo')
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
