import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
    generateBranchName: vi.fn(async () => 'repo/oslo'),
    pickRandomNorwegianCityName: vi.fn(() => 'Oslo'),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

vi.mock('../git/branch-namer', () => ({
  generateBranchName: mocks.generateBranchName,
}))

vi.mock('../../shared/norwegian-cities', () => ({
  pickRandomNorwegianCityName: mocks.pickRandomNorwegianCityName,
}))

describe('registerAgentHandlers — branch suggestion', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('uses a Norwegian city when suggesting a branch without a task description', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ path: '/repo' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => []),
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('branch:suggest')
    if (!handler) throw new Error('branch:suggest handler was not registered')

    const result = await handler({}, 'proj-1')

    expect(mocks.pickRandomNorwegianCityName).toHaveBeenCalledTimes(1)
    expect(mocks.generateBranchName).toHaveBeenCalledWith('/repo', 'Oslo')
    expect(result).toBe('repo/oslo')
  })

  it('uses the provided task description when suggesting a branch', async () => {
    const { registerAgentHandlers } = await import('./agent-handlers')
    const deps = {
      projectRegistry: {
        getProject: vi.fn(() => ({ path: '/repo' })),
      },
      sessionManager: {
        listSessions: vi.fn(() => []),
      },
      fileWatcher: {
        unwatch: vi.fn(),
        watch: vi.fn(),
      },
      viewStateStore: { delete: vi.fn() },
    }

    registerAgentHandlers(deps as never)
    const handler = mocks.handlers.get('branch:suggest')
    if (!handler) throw new Error('branch:suggest handler was not registered')

    await handler({}, 'proj-1', 'Ship launch checklist')

    expect(mocks.pickRandomNorwegianCityName).not.toHaveBeenCalled()
    expect(mocks.generateBranchName).toHaveBeenCalledWith('/repo', 'Ship launch checklist')
  })
})
