import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRuntimeByIdMock = vi.hoisted(() => vi.fn())

vi.mock('../agent/runtimes', () => ({
  getRuntimeById: getRuntimeByIdMock,
}))

describe('resolveSearchAiRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prefers the active session runtime when search AI uses the default setting', async () => {
    const { resolveSearchAiRuntime } = await import('./search-ai-runtime')
    getRuntimeByIdMock.mockReturnValue({ id: 'codex', binary: 'codex' })

    const result = resolveSearchAiRuntime(createDeps({
      defaultRuntime: 'claude',
      sessionRuntimeId: 'codex',
    }), 'session-1', 'default')

    expect(result).toEqual({
      runtimeId: 'codex',
      runtime: { id: 'codex', binary: 'codex' },
    })
  })

  it('falls back to the configured default runtime when there is no active session runtime', async () => {
    const { resolveSearchAiRuntime } = await import('./search-ai-runtime')
    getRuntimeByIdMock.mockReturnValue({ id: 'claude', binary: 'claude' })

    const result = resolveSearchAiRuntime(createDeps({
      defaultRuntime: 'claude',
      sessionRuntimeId: undefined,
    }), null, 'default')

    expect(result).toEqual({
      runtimeId: 'claude',
      runtime: { id: 'claude', binary: 'claude' },
    })
  })

  it('respects an explicit search AI runtime override', async () => {
    const { resolveSearchAiRuntime } = await import('./search-ai-runtime')
    getRuntimeByIdMock.mockReturnValue({ id: 'gemini', binary: 'gemini' })

    const result = resolveSearchAiRuntime(createDeps({
      defaultRuntime: 'claude',
      sessionRuntimeId: 'codex',
    }), 'session-1', 'gemini')

    expect(result).toEqual({
      runtimeId: 'gemini',
      runtime: { id: 'gemini', binary: 'gemini' },
    })
  })
})

function createDeps({
  defaultRuntime,
  sessionRuntimeId,
}: {
  defaultRuntime: string
  sessionRuntimeId?: string
}) {
  return {
    settingsStore: {
      getSettings: vi.fn(() => ({
        defaultRuntime,
      })),
    },
    sessionManager: {
      getSession: vi.fn(() => (sessionRuntimeId ? { runtimeId: sessionRuntimeId } : undefined)),
    },
  }
}
