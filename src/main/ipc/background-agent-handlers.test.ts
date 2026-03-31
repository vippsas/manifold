import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    }),
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
  },
}))

describe('registerBackgroundAgentHandlers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.handlers.clear()
  })

  it('registers and delegates list, refresh, pause, resume, stop, feedback, clear, and status handlers', async () => {
    const { registerBackgroundAgentHandlers } = await import('./background-agent-handlers')
    const deps = {
      backgroundAgentHost: {
        listSuggestions: vi.fn(() => ({ suggestions: [] })),
        refreshSuggestions: vi.fn(async () => ({ suggestions: [{ id: 'suggestion-1' }] })),
        resumeSuggestions: vi.fn(async () => ({ suggestions: [{ id: 'suggestion-1' }] })),
        pauseSuggestions: vi.fn(() => ({ suggestions: [] })),
        stopSuggestions: vi.fn(() => ({ suggestions: [] })),
        recordFeedback: vi.fn(() => ({ suggestions: [{ id: 'suggestion-1' }] })),
        clearSuggestions: vi.fn(() => ({ suggestions: [] })),
        getStatus: vi.fn(() => ({ phase: 'ready' })),
      },
    }

    registerBackgroundAgentHandlers(deps as never)

    const listHandler = mocks.handlers.get('background-agent:list-suggestions')
    const refreshHandler = mocks.handlers.get('background-agent:refresh')
    const resumeHandler = mocks.handlers.get('background-agent:resume')
    const pauseHandler = mocks.handlers.get('background-agent:pause')
    const stopHandler = mocks.handlers.get('background-agent:stop')
    const feedbackHandler = mocks.handlers.get('background-agent:feedback')
    const clearHandler = mocks.handlers.get('background-agent:clear')
    const statusHandler = mocks.handlers.get('background-agent:get-status')

    expect(listHandler).toBeTypeOf('function')
    expect(refreshHandler).toBeTypeOf('function')
    expect(resumeHandler).toBeTypeOf('function')
    expect(pauseHandler).toBeTypeOf('function')
    expect(stopHandler).toBeTypeOf('function')
    expect(feedbackHandler).toBeTypeOf('function')
    expect(clearHandler).toBeTypeOf('function')
    expect(statusHandler).toBeTypeOf('function')

    expect(listHandler?.({}, 'project-1')).toEqual({ suggestions: [] })
    await expect(refreshHandler?.({}, 'project-1', 'session-1')).resolves.toEqual({
      suggestions: [{ id: 'suggestion-1' }],
    })
    await expect(resumeHandler?.({}, 'project-1', 'session-1')).resolves.toEqual({
      suggestions: [{ id: 'suggestion-1' }],
    })
    expect(pauseHandler?.({}, 'project-1')).toEqual({ suggestions: [] })
    expect(stopHandler?.({}, 'project-1')).toEqual({ suggestions: [] })
    expect(feedbackHandler?.({}, 'project-1', 'suggestion-1', 'useful')).toEqual({
      suggestions: [{ id: 'suggestion-1' }],
    })
    expect(clearHandler?.({}, 'project-1')).toEqual({ suggestions: [] })
    expect(statusHandler?.({}, 'project-1')).toEqual({ phase: 'ready' })

    expect(deps.backgroundAgentHost.listSuggestions).toHaveBeenCalledWith('project-1')
    expect(deps.backgroundAgentHost.refreshSuggestions).toHaveBeenCalledWith('project-1', 'session-1')
    expect(deps.backgroundAgentHost.resumeSuggestions).toHaveBeenCalledWith('project-1', 'session-1')
    expect(deps.backgroundAgentHost.pauseSuggestions).toHaveBeenCalledWith('project-1')
    expect(deps.backgroundAgentHost.stopSuggestions).toHaveBeenCalledWith('project-1')
    expect(deps.backgroundAgentHost.recordFeedback).toHaveBeenCalledWith('project-1', 'suggestion-1', 'useful')
    expect(deps.backgroundAgentHost.clearSuggestions).toHaveBeenCalledWith('project-1')
    expect(deps.backgroundAgentHost.getStatus).toHaveBeenCalledWith('project-1')
  })
})
