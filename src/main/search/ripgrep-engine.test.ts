import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { SearchQueryRequest } from '../../shared/search-types'
import type { AgentSession } from '../../shared/types'

const mockSpawn = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  default: { spawn: mockSpawn },
}))

describe('searchWithRipgrep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('streams ripgrep output and stops once the per-root limit is reached', async () => {
    const { searchWithRipgrep } = await import('./ripgrep-engine')
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    process.nextTick(() => {
      child.stdout.emit('data', Buffer.from('CLAUDE.md:5:1:repo about trancefjord\nCLA'))
      child.stdout.emit('data', Buffer.from('UDE.md:7:1:another trancefjord match\nCLAUDE.md:9:1:third match\n'))
      child.emit('close', null)
    })

    const results = await searchWithRipgrep([createRoot()], createRequest(), 2)

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      relativePath: 'CLAUDE.md',
      line: 5,
    })
    expect(results[1]).toMatchObject({
      relativePath: 'CLAUDE.md',
      line: 7,
    })
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('returns an empty result set on ripgrep exit code 1', async () => {
    const { searchWithRipgrep } = await import('./ripgrep-engine')
    const child = createMockChild()
    mockSpawn.mockReturnValue(child)

    process.nextTick(() => {
      child.emit('close', 1)
    })

    await expect(searchWithRipgrep([createRoot()], createRequest(), 5)).resolves.toEqual([])
  })
})

function createMockChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  })
}

function createRequest(overrides: Partial<SearchQueryRequest> = {}): SearchQueryRequest {
  return {
    projectId: 'project-1',
    activeSessionId: 'session-1',
    mode: 'code',
    query: 'tran',
    scope: { kind: 'active-session' },
    matchMode: 'literal',
    caseSensitive: false,
    wholeWord: false,
    ...overrides,
  }
}

function createRoot() {
  const session: AgentSession = {
    id: 'session-1',
    projectId: 'project-1',
    runtimeId: 'codex',
    branchName: 'larvik',
    worktreePath: '/repo/.manifold/worktrees/larvik',
    status: 'running',
    pid: 1,
    additionalDirs: [],
  }

  return {
    path: '/repo/.manifold/worktrees/larvik',
    kind: 'worktree' as const,
    session,
  }
}
