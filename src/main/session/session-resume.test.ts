import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: vi.fn(() => ({
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    args: ['--allow-dangerously-skip-permissions'],
    env: undefined,
  })),
}))

vi.mock('../agent/agent-env', () => ({
  agentSpawnEnv: vi.fn(() => ({})),
}))

vi.mock('../git/managed-worktree', () => ({
  prepareManagedWorktree: vi.fn(async () => {}),
}))

vi.mock('../git/worktree-meta', () => ({
  readWorktreeMeta: vi.fn(async () => null),
}))

vi.mock('./transcript-usage-reader', () => ({
  claudeProjectsDir: vi.fn(() => '/claude'),
  locateClaudeTranscript: vi.fn(async () => null),
}))

import { resumeAgentSession } from './session-resume'
import { locateClaudeTranscript } from './transcript-usage-reader'
import type { PtyPool } from '../agent/pty-pool'
import type { SessionStreamWirer } from './session-stream-wirer'
import type { InternalSession } from './session-types'

function makeSession(): InternalSession {
  return {
    id: 'sid-1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/foo',
    worktreePath: '/wt', status: 'done', pid: null, ptyId: '', outputBuffer: '',
    additionalDirs: [],
  } as InternalSession
}

function makeDeps() {
  const ptyPool = { spawn: vi.fn(() => ({ id: 'pty-1', pid: 123 })) } as unknown as PtyPool
  const streamWirer = { wireOutputStreaming: vi.fn(), wireExitHandling: vi.fn() } as unknown as SessionStreamWirer
  return { ptyPool, streamWirer }
}

describe('resumeAgentSession interactive Claude', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes --resume <session id> so resumed work appends to the same transcript', async () => {
    vi.mocked(locateClaudeTranscript).mockResolvedValue('/claude/proj/sid-1.jsonl')
    const { ptyPool, streamWirer } = makeDeps()
    const session = makeSession()

    await resumeAgentSession(session, 'claude', ptyPool, streamWirer)

    const spawnArgs = vi.mocked(ptyPool.spawn).mock.calls[0][1] as string[]
    const idx = spawnArgs.indexOf('--resume')
    expect(idx).toBeGreaterThan(-1)
    expect(spawnArgs[idx + 1]).toBe('sid-1')
  })

  it('does not pass --resume when no transcript exists for the session id', async () => {
    vi.mocked(locateClaudeTranscript).mockResolvedValue(null)
    const { ptyPool, streamWirer } = makeDeps()
    const session = makeSession()

    await resumeAgentSession(session, 'claude', ptyPool, streamWirer)

    const spawnArgs = vi.mocked(ptyPool.spawn).mock.calls[0][1] as string[]
    expect(spawnArgs).not.toContain('--resume')
  })
})
