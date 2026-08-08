import { describe, it, expect, vi, beforeEach } from 'vitest'

let uuidCounter = 0
vi.mock('uuid', () => ({
  v4: vi.fn(() => `session-uuid-${++uuidCounter}`),
}))

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn(() => ({ id: 'claude', name: 'Claude Code', binary: 'claude', args: [], env: undefined })),
}))

// Keep the spawn env off the developer's real ~/.manifold/agent.env (#771).
vi.mock('../agent/agent-env', () => ({
  agentSpawnEnv: vi.fn(() => undefined),
}))

vi.mock('../agent/status-detector', () => ({
  detectStatus: vi.fn(() => 'running'),
}))

vi.mock('../git/git-exec', () => ({
  gitExec: vi.fn().mockResolvedValue('main\n'),
}))

vi.mock('../git/managed-worktree', () => ({
  prepareManagedWorktree: vi.fn().mockResolvedValue(undefined),
}))

import { SessionManager } from './session-manager'
import type { WorktreeManager } from '../git/worktree-manager'
import type { PtyPool } from '../agent/pty-pool'
import type { ProjectRegistry } from '../store/project-registry'
import type { FileWatcher } from '../fs/file-watcher'
import {
  createMockWorktreeManager,
  createMockPtyPool,
  createMockProjectRegistry,
  createMockWindow,
} from './session-manager.test-helpers'

/** An agent's checkout does not stay on the branch the session was created on:
 *  the agent cuts a new branch, the PR flow renames one, or the user switches in
 *  the shell. The session must follow, since its branchName is what the status
 *  bar shows and what "Create PR" pushes. */
describe('SessionManager — branch follows the checkout', () => {
  let sessionManager: SessionManager
  let window: ReturnType<typeof createMockWindow>
  let notifyBranchChanged: (sessionId: string, branch: string) => void

  beforeEach(async () => {
    vi.clearAllMocks()
    uuidCounter = 0
    const fileWatcher = {
      watch: vi.fn(),
      watchAdditionalDir: vi.fn(),
      setOnBranchChanged: vi.fn((listener: (sessionId: string, branch: string) => void) => {
        notifyBranchChanged = listener
      }),
    }
    window = createMockWindow()
    sessionManager = new SessionManager(
      createMockWorktreeManager() as unknown as WorktreeManager,
      createMockPtyPool() as unknown as PtyPool,
      createMockProjectRegistry() as unknown as ProjectRegistry,
      undefined,
      fileWatcher as unknown as FileWatcher,
    )
    sessionManager.setMainWindow(window)
    await sessionManager.createSession({ projectId: 'proj-1', runtimeId: 'claude', prompt: 'test' })
  })

  it('renames the session to the branch its checkout moved to', () => {
    expect(sessionManager.getSession('session-uuid-1')?.branchName).toBe('manifold/oslo')

    notifyBranchChanged('session-uuid-1', 'fix-the-status-bar')

    expect(sessionManager.getSession('session-uuid-1')?.branchName).toBe('fix-the-status-bar')
  })

  it('tells the renderer to re-read the sessions so the status bar relabels', () => {
    vi.mocked(window.webContents.send).mockClear()

    notifyBranchChanged('session-uuid-1', 'fix-the-status-bar')

    expect(window.webContents.send).toHaveBeenCalledWith('agent:sessions-changed', { projectId: 'proj-1' })
  })

  it('stays quiet when the branch is the one already recorded', () => {
    vi.mocked(window.webContents.send).mockClear()

    notifyBranchChanged('session-uuid-1', 'manifold/oslo')

    expect(window.webContents.send).not.toHaveBeenCalled()
  })

  it('ignores a branch reported for a session that is already gone', () => {
    expect(() => notifyBranchChanged('session-uuid-404', 'fix-the-status-bar')).not.toThrow()
  })

  // The watcher polls a path once, under whichever session id watched it last —
  // but a checkout is on one branch, so its every agent moved with it.
  it('moves the sibling agents sharing the checkout too', async () => {
    await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'sibling',
      existingWorktreePath: '/repo/.manifold/worktrees/manifold-oslo',
    })

    notifyBranchChanged('session-uuid-2', 'fix-the-status-bar')

    expect(sessionManager.getSession('session-uuid-1')?.branchName).toBe('fix-the-status-bar')
    expect(sessionManager.getSession('session-uuid-2')?.branchName).toBe('fix-the-status-bar')
  })

  it('leaves a session in a different checkout alone', async () => {
    await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'elsewhere',
      existingWorktreePath: '/repo/.manifold/worktrees/manifold-bergen',
    })

    notifyBranchChanged('session-uuid-1', 'fix-the-status-bar')

    expect(sessionManager.getSession('session-uuid-2')?.branchName).not.toBe('fix-the-status-bar')
  })
})
