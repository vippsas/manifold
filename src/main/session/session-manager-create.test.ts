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

// Isolate the spawn env from the developer's real ~/.manifold/agent.env (#771):
// without this, a populated agent.env leaks real vars into the spawn and breaks
// the `env: undefined` assertions on any machine that has the file.
vi.mock('../agent/agent-env', () => ({
  agentSpawnEnv: vi.fn(() => undefined),
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
import { chatStorageKey } from '../agent/chat-adapter'
import { WorktreeManager } from '../git/worktree-manager'
import { PtyPool } from '../agent/pty-pool'
import { ProjectRegistry } from '../store/project-registry'
import type { MemoryCapture } from '../memory/memory-capture'
import { gitExec } from '../git/git-exec'
import {
  createMockWorktreeManager,
  createMockPtyPool,
  createMockProjectRegistry,
} from './session-manager.test-helpers'

describe('SessionManager — create / input / queries', () => {
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
        ['--allow-dangerously-skip-permissions', '--session-id', session.id, '--settings', '{"theme":"dark-ansi"}'],
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

    describe('slash-command autocomplete seeding (chat mode)', () => {
      it('seeds a chat-mode session from the cached project list without probing', async () => {
        ;(projectRegistry.getProject as ReturnType<typeof vi.fn>).mockReturnValue({
          id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '2024-01-01',
          slashCommands: ['compact', 'superpowers:brainstorming'],
        })

        await sessionManager.createSession({
          projectId: 'proj-1',
          runtimeId: 'claude',
          nonInteractive: true,
        })

        expect(sessionManager.getSlashCommands('session-uuid-1')).toEqual([
          'compact', 'superpowers:brainstorming',
        ])
        // A cache hit must not spawn a throwaway probe process.
        expect(ptyPool.spawn).not.toHaveBeenCalled()
      })

      it('probes for the command list when a deferred chat-mode session has no cache', async () => {
        await sessionManager.createSession({
          projectId: 'proj-1',
          runtimeId: 'claude',
          nonInteractive: true,
        })

        // Deferred chat sessions spawn no runtime PTY, so the only spawn is the probe.
        expect(ptyPool.spawn).toHaveBeenCalledWith(
          'claude',
          expect.arrayContaining(['-p', 'hi', '--output-format', 'stream-json']),
          expect.objectContaining({ cwd: '/repo/.manifold/worktrees/manifold-oslo' }),
        )
      })

      it('does not seed or probe for an interactive session', async () => {
        await sessionManager.createSession({
          projectId: 'proj-1',
          runtimeId: 'claude',
          prompt: 'do something',
        })

        expect(sessionManager.getSlashCommands('session-uuid-1')).toEqual([])
        // The only spawn is the interactive runtime itself — never a probe.
        expect(ptyPool.spawn).toHaveBeenCalledTimes(1)
        expect(ptyPool.spawn).toHaveBeenCalledWith(
          'claude',
          ['--allow-dangerously-skip-permissions', '--session-id', 'session-uuid-1', '--settings', '{"theme":"dark-ansi"}'],
          expect.anything(),
        )
      })
    })
  })

  // SessionManager.createSession is a permissive primitive — it does not enforce
  // one-in-place-agent-per-repo; that policy lives at the agent:spawn IPC layer
  // (focusOrClearInPlaceSessions), which focuses an existing live in-place agent
  // instead of creating a second. These tests pin the primitive's behavior.
  describe('noWorktree at the session-manager layer (policy enforced at agent:spawn)', () => {
    // Use a folder (non-git) project to avoid git clean-tree checks in session-creator
    beforeEach(() => {
      ;(projectRegistry.getProject as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
        if (id === 'proj-folder') {
          return { id: 'proj-folder', name: 'folder-app', path: '/folder', baseBranch: 'main', addedAt: '2024-01-01', kind: 'folder' }
        }
        if (id === 'proj-1') {
          return { id: 'proj-1', name: 'test', path: '/repo', baseBranch: 'main', addedAt: '2024-01-01' }
        }
        return undefined
      })
    })

    it('allows a second no-worktree agent for the same project', async () => {
      const first = await sessionManager.createSession({
        projectId: 'proj-folder',
        runtimeId: 'claude',
        prompt: 'first',
      })

      const second = await sessionManager.createSession({
        projectId: 'proj-folder',
        runtimeId: 'claude',
        prompt: 'second',
      })

      expect(first.id).not.toBe(second.id)
      expect(sessionManager.listSessions()).toHaveLength(2)
    })

    it('concurrent noWorktree spawns for the same project each create a session', async () => {
      const [a, b] = await Promise.all([
        sessionManager.createSession({ projectId: 'proj-folder', runtimeId: 'claude', prompt: 'a' }),
        sessionManager.createSession({ projectId: 'proj-folder', runtimeId: 'claude', prompt: 'b' }),
      ])

      expect(a.id).not.toBe(b.id)
      expect(sessionManager.listSessions()).toHaveLength(2)
      expect(ptyPool.spawn).toHaveBeenCalledTimes(2)
    })
  })

  describe('startDevServerSession', () => {
    it('starts the preview even when git cannot spawn for branch prep', async () => {
      const error = Object.assign(new Error('spawn git ENOENT'), {
        code: 'ENOENT',
        syscall: 'spawn git',
      })
      vi.mocked(gitExec).mockRejectedValueOnce(error)

      await expect(
        sessionManager.startDevServerSession(
          'proj-1',
          'manifold/oslo',
          'preview the app',
          undefined,
          undefined,
          'codex',
        ),
      ).resolves.toEqual({ sessionId: 'session-uuid-1' })

      expect(ptyPool.spawn).toHaveBeenCalledWith('npm', ['run', 'dev'], { cwd: '/repo' })
      expect(sessionManager.getSession('session-uuid-1')?.status).toBe('running')
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
      expect(memoryCapture.recordInput).toHaveBeenCalledWith('session-uuid-1', 'some input')
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
      expect((session as unknown as Record<string, unknown>)['ptyId']).toBeUndefined()
      expect((session as unknown as Record<string, unknown>)['outputBuffer']).toBeUndefined()
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

  describe('renameSession', () => {
    it('updates the session display name and notifies renderers', async () => {
      const window = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
      }
      sessionManager.setMainWindow(window as never)
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const renamed = await sessionManager.renameSession('session-uuid-1', '  Release agent  ')

      expect(renamed.displayName).toBe('Release agent')
      expect(sessionManager.getSession('session-uuid-1')?.displayName).toBe('Release agent')
      expect(window.webContents.send).toHaveBeenCalledWith('agent:sessions-changed', { projectId: 'proj-1' })
    })

    it('rejects empty display names', async () => {
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      await expect(sessionManager.renameSession('session-uuid-1', '   ')).rejects.toThrow(
        'Agent name cannot be empty',
      )
    })
  })

  describe('configureSession', () => {
    it('keeps the existing session when only its name changes', async () => {
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const configured = await sessionManager.configureSession(session.id, {
        displayName: 'Renamed agent',
        runtimeId: 'claude',
        viewMode: 'terminal',
      })

      expect(configured).toMatchObject({ id: session.id, displayName: 'Renamed agent' })
      expect(ptyPool.kill).not.toHaveBeenCalled()
      expect(ptyPool.spawn).toHaveBeenCalledTimes(1)
    })

    it('replaces an interactive agent with a fresh chat session in the same worktree', async () => {
      const chatAdapter = { setSessionStorage: vi.fn(), clearSession: vi.fn() }
      sessionManager.setChatAdapter(chatAdapter as never)
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
        additionalDirs: ['/repo/two'],
      })

      const configured = await sessionManager.configureSession(session.id, {
        displayName: 'Review agent',
        runtimeId: 'codex',
        viewMode: 'chat',
      })

      expect(ptyPool.kill).toHaveBeenCalledWith('pty-1')
      expect(configured).toMatchObject({
        id: 'session-uuid-2',
        worktreePath: session.worktreePath,
        displayName: 'Review agent',
        runtimeId: 'codex',
        nonInteractive: true,
        status: 'waiting',
        pid: null,
        additionalDirs: ['/repo/two'],
      })
      expect(sessionManager.getSession(session.id)).toBeUndefined()
      expect(worktreeManager.removeWorktree).not.toHaveBeenCalled()
      // Scoped to the replaced agent, not the folder: other agents in the same
      // checkout keep their own chat history.
      expect(chatAdapter.clearSession).toHaveBeenCalledWith(
        session.id,
        true,
        chatStorageKey(session.worktreePath, session.id),
      )
    })

    it('starts an interactive runtime when switching from chat to terminal', async () => {
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: '',
        nonInteractive: true,
        additionalDirs: ['/repo/two'],
      })
      vi.mocked(ptyPool.spawn).mockClear()

      const configured = await sessionManager.configureSession(session.id, {
        displayName: 'Terminal agent',
        runtimeId: 'codex',
        viewMode: 'terminal',
      })

      expect(configured).toMatchObject({ id: 'session-uuid-2', runtimeId: 'codex', nonInteractive: false, status: 'running' })
      expect(ptyPool.spawn).toHaveBeenCalledWith(
        'codex',
        ['--sandbox', 'workspace-write', '--add-dir', '/repo/two'],
        { cwd: session.worktreePath, env: undefined },
      )
    })

    it('validates the runtime before stopping the current process', async () => {
      const session = await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      await expect(sessionManager.configureSession(session.id, {
        displayName: 'Agent',
        runtimeId: 'missing',
        viewMode: 'chat',
      })).rejects.toThrow('Runtime not found: missing')
      expect(ptyPool.kill).not.toHaveBeenCalled()
    })
  })

  describe('setSessionLocked', () => {
    it('toggles the locked flag and notifies renderers', async () => {
      const window = {
        isDestroyed: vi.fn(() => false),
        webContents: { send: vi.fn() },
      }
      sessionManager.setMainWindow(window as never)
      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const locked = await sessionManager.setSessionLocked('session-uuid-1', true)
      expect(locked.locked).toBe(true)
      expect(sessionManager.getSession('session-uuid-1')?.locked).toBe(true)
      expect(window.webContents.send).toHaveBeenCalledWith('agent:sessions-changed', { projectId: 'proj-1' })

      const unlocked = await sessionManager.setSessionLocked('session-uuid-1', false)
      expect(unlocked.locked).toBe(false)
      expect(sessionManager.getSession('session-uuid-1')?.locked).toBe(false)
    })

    it('rejects an unknown session', async () => {
      await expect(sessionManager.setSessionLocked('nope', true)).rejects.toThrow('Session not found')
    })
  })
})
