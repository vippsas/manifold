import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createShellPtySession } from './session-resume'

vi.mock('./shell-prompt', () => ({
  buildShellEnv: vi.fn(() => ({
    MANIFOLD_WORKTREE: '1',
    MANIFOLD_AGENT_NAME: 'test',
    MANIFOLD_REPO: 'repo',
    MANIFOLD_BRANCH: 'manifold/test',
  })),
  buildWelcomeMessage: vi.fn(() => 'welcome\r\n'),
  createManifoldZdotdir: vi.fn(() => '/tmp/manifold-zsh-abc'),
  createManifoldBashRcFile: vi.fn(() => '/tmp/manifold-bash-xyz'),
  detectShell: vi.fn((s: string) => {
    if (s.endsWith('zsh')) return 'zsh'
    if (s.endsWith('bash')) return 'bash'
    return 'other'
  }),
}))

const makePool = () => ({
  spawn: vi.fn().mockReturnValue({ id: 'p1', pid: 1 }),
  pushOutput: vi.fn(),
  onExit: vi.fn(),
})

const makeWirer = () => ({
  wireOutputStreaming: vi.fn(),
  wireExitHandling: vi.fn(),
})

describe('createShellPtySession bash spawn args', () => {
  const origShell = process.env.SHELL

  afterEach(() => {
    process.env.SHELL = origShell
    vi.clearAllMocks()
  })

  it('spawns bash with --rcfile and no ZDOTDIR when shellPrompt enabled', () => {
    process.env.SHELL = '/bin/bash'
    const pool = makePool()
    const wirer = makeWirer()
    createShellPtySession('/tmp/repo', pool as any, wirer as any, new Map(), { shellPrompt: true })
    expect(pool.spawn).toHaveBeenCalledWith(
      '/bin/bash',
      ['--rcfile', '/tmp/manifold-bash-xyz', '-i'],
      expect.objectContaining({ cwd: '/tmp/repo' }),
    )
    const spawnCall = pool.spawn.mock.calls[0]
    expect(spawnCall[2]?.env?.ZDOTDIR).toBeUndefined()
  })

  it('spawns zsh with -il and ZDOTDIR when shellPrompt enabled', () => {
    process.env.SHELL = '/bin/zsh'
    const pool = makePool()
    const wirer = makeWirer()
    createShellPtySession('/tmp/repo', pool as any, wirer as any, new Map(), { shellPrompt: true })
    expect(pool.spawn).toHaveBeenCalledWith(
      '/bin/zsh',
      ['-il'],
      expect.objectContaining({ env: expect.objectContaining({ ZDOTDIR: '/tmp/manifold-zsh-abc' }) }),
    )
  })

  it('spawns with -il when shellPrompt disabled regardless of shell', () => {
    process.env.SHELL = '/bin/bash'
    const pool = makePool()
    const wirer = makeWirer()
    createShellPtySession('/tmp/repo', pool as any, wirer as any, new Map(), { shellPrompt: false })
    expect(pool.spawn).toHaveBeenCalledWith('/bin/bash', ['-il'], expect.anything())
  })
})
