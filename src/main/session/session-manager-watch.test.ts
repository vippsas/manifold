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
} from './session-manager.test-helpers'

/** Nothing about a session is polled until its checkout is registered with the
 *  file watcher, and that poll is what keeps the status bar's branch honest when
 *  the agent cuts a new one (#905). Registering it at the `agent:spawn` handler
 *  left every other way of creating a session unpolled — workspace agents above
 *  all, which are created straight through SessionManager. */
describe('SessionManager — a created session watches its checkout', () => {
  let sessionManager: SessionManager
  let fileWatcher: { watch: ReturnType<typeof vi.fn>; watchAdditionalDir: ReturnType<typeof vi.fn>; setOnBranchChanged: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    fileWatcher = {
      watch: vi.fn(),
      watchAdditionalDir: vi.fn(),
      setOnBranchChanged: vi.fn(),
    }
    sessionManager = new SessionManager(
      createMockWorktreeManager() as unknown as WorktreeManager,
      createMockPtyPool() as unknown as PtyPool,
      createMockProjectRegistry() as unknown as ProjectRegistry,
      undefined,
      fileWatcher as unknown as FileWatcher,
    )
  })

  it('polls the checkout of an agent created through the manager', async () => {
    const session = await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'test',
    })

    expect(fileWatcher.watch).toHaveBeenCalledWith(session.worktreePath, session.id)
  })

  // A workspace agent joins a checkout the workspace already owns and takes the
  // other repos along as --add-dir folders; it is created straight through the
  // manager, never through the spawn handler that used to do the watching.
  it('polls the checkout a workspace agent joins, and its other folders', async () => {
    const session = await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'workspace agent',
      existingWorktreePath: '/repo/.wt/manifold-auth',
      additionalDirs: ['/repo/web/.wt/manifold-auth'],
      workspaceId: 'ws-1',
    })

    expect(fileWatcher.watch).toHaveBeenCalledWith('/repo/.wt/manifold-auth', session.id)
    expect(fileWatcher.watchAdditionalDir).toHaveBeenCalledWith('/repo/web/.wt/manifold-auth', session.id)
  })

  // The home workspace's agent works in the clone itself, on whatever branch the
  // user left it on — exactly the case that showed a stale branch in the status
  // bar after the agent ran `git checkout -b`.
  it('polls the repo itself for an in-place agent', async () => {
    const session = await sessionManager.createSession({
      projectId: 'proj-1',
      runtimeId: 'claude',
      prompt: 'in place',
      noWorktree: true,
      stayOnBranch: true,
    })

    expect(fileWatcher.watch).toHaveBeenCalledWith('/repo', session.id)
  })
})
