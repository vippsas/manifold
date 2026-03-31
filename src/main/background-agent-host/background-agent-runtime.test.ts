import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeByIdMock = vi.hoisted(() => vi.fn())
const debugLogMock = vi.hoisted(() => vi.fn())

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: getRuntimeByIdMock,
}))

vi.mock('../app/debug-log', () => ({
  debugLog: debugLogMock,
}))

describe('background-agent-runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the active session runtime and worktree when available', async () => {
    const { resolveBackgroundAgentRuntime } = await import('./background-agent-runtime')
    getRuntimeByIdMock.mockReturnValue({ id: 'codex', binary: 'codex' })

    const result = resolveBackgroundAgentRuntime(createDeps({
      defaultRuntime: 'claude',
      sessionRuntimeId: 'codex',
      sessionWorktreePath: '/repo/.manifold/worktrees/feature-ideas',
    }), 'project-1', 'session-1')

    expect(result).toEqual({
      runtimeId: 'codex',
      runtime: { id: 'codex', binary: 'codex' },
      cwd: '/repo/.manifold/worktrees/feature-ideas',
      context: {
        activeSessionId: 'session-1',
        runtimeId: 'codex',
        worktreePath: '/repo/.manifold/worktrees/feature-ideas',
        mode: 'non-interactive',
      },
    })
  })

  it('falls back to the project default runtime and project path when there is no active session', async () => {
    const { resolveBackgroundAgentRuntime } = await import('./background-agent-runtime')
    getRuntimeByIdMock.mockReturnValue({ id: 'claude', binary: 'claude' })

    const result = resolveBackgroundAgentRuntime(createDeps({
      defaultRuntime: 'claude',
    }), 'project-1', null)

    expect(result).toEqual({
      runtimeId: 'claude',
      runtime: { id: 'claude', binary: 'claude' },
      cwd: '/repo',
      context: {
        activeSessionId: null,
        runtimeId: 'claude',
        worktreePath: '/repo',
        mode: 'non-interactive',
      },
    })
  })

  it('uses research-specific args and timeouts in research mode', async () => {
    const { runBackgroundAgentPrompt } = await import('./background-agent-runtime')
    getRuntimeByIdMock.mockReturnValue({
      id: 'codex',
      binary: 'codex',
      aiModelArgs: ['--model', 'gpt-5'],
    })

    const deps = createDeps({
      defaultRuntime: 'codex',
      gitOps: {
        aiGenerate: vi.fn(async () => 'ok'),
      },
    })

    await runBackgroundAgentPrompt(deps as never, {
      prompt: 'Find ecosystem shifts.',
      projectId: 'project-1',
      activeSessionId: null,
      mode: 'research',
      silent: true,
    })

    expect(deps.gitOps.aiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'codex', binary: 'codex' }),
      'Find ecosystem shifts.',
      '/repo',
      ['--search'],
      {
        timeoutMs: 300_000,
        silent: true,
      },
    )
  })
})

function createDeps(overrides: {
  defaultRuntime: string
  sessionRuntimeId?: string
  sessionWorktreePath?: string
  gitOps?: { aiGenerate: ReturnType<typeof vi.fn> }
}) {
  return {
    settingsStore: {
      getSettings: vi.fn(() => ({
        defaultRuntime: overrides.defaultRuntime,
      })),
    },
    projectRegistry: {
      getProject: vi.fn(() => ({
        id: 'project-1',
        path: '/repo',
      })),
    },
    sessionManager: {
      getSession: vi.fn(() => (
        overrides.sessionRuntimeId
          ? {
            runtimeId: overrides.sessionRuntimeId,
            worktreePath: overrides.sessionWorktreePath ?? '/repo/.manifold/worktrees/default',
          }
          : null
      )),
    },
    gitOps: overrides.gitOps ?? {
      aiGenerate: vi.fn(async () => 'ok'),
    },
  }
}
