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
  detectVercelUrl: vi.fn(() => null),
  detectVercelDeployFailure: vi.fn(() => false),
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
  createMockWindow,
} from './session-manager.test-helpers'

describe('SessionManager — window / shell / add-dir', () => {
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
        ['-il'],
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

  describe('add-dir detection', () => {
    it('detects added directory from PTY output and updates session', async () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void

      dataCallback('Added /Users/sven/git/landingpage as a working directory for this session')

      const session = sessionManager.getSession('session-uuid-1')
      expect(session?.additionalDirs).toEqual(['/Users/sven/git/landingpage'])
    })

    it('sends agent:dirs-changed event to renderer', async () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void

      dataCallback('Added /tmp/mydir as a working directory for this session')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'agent:dirs-changed',
        { sessionId: 'session-uuid-1', additionalDirs: ['/tmp/mydir'] },
      )
    })

    it('deduplicates directories', async () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      await sessionManager.createSession({
        projectId: 'proj-1',
        runtimeId: 'claude',
        prompt: 'test',
      })

      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void

      dataCallback('Added /tmp/mydir as a working directory for this session')
      dataCallback('Added /tmp/mydir as a working directory for this session')

      const session = sessionManager.getSession('session-uuid-1')
      expect(session?.additionalDirs).toEqual(['/tmp/mydir'])
    })

    it('does not run detection for shell sessions', async () => {
      const mockWindow = createMockWindow()
      sessionManager.setMainWindow(mockWindow)

      sessionManager.createShellSession('/some/cwd')

      const onDataCall = (ptyPool.onData as ReturnType<typeof vi.fn>).mock.calls[0]
      const dataCallback = onDataCall[1] as (data: string) => void

      dataCallback('Added /tmp/mydir as a working directory for this session')

      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        'agent:dirs-changed',
        expect.anything(),
      )
    })
  })
})
