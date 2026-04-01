import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useApps } from './useApps'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
    send: vi.fn(),
  }
})

describe('useApps', () => {
  it('only marks waiting apps as preview-ready when a preview URL was detected', async () => {
    mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
      if (channel === 'agent:sessions') {
        return Promise.resolve([
          {
            id: 'session-no-preview',
            projectId: 'project-1',
            runtimeId: 'codex',
            branchName: 'clock/fredrikstad',
            status: 'waiting',
            taskDescription: 'Clock',
          },
          {
            id: 'session-with-preview',
            projectId: 'project-2',
            runtimeId: 'codex',
            branchName: 'hello/world',
            status: 'waiting',
            taskDescription: 'Hello',
          },
          {
            id: 'external-session',
            projectId: 'project-3',
            runtimeId: 'codex',
            branchName: 'feature/outside',
            status: 'waiting',
            taskDescription: 'Outside simple mode',
          },
        ])
      }

      if (channel === 'projects:list') {
        return Promise.resolve([
          {
            id: 'project-1',
            name: 'clock',
            path: '/Users/test/.manifold/projects/clock',
            simpleTemplateTitle: 'Tool Researcher',
            simplePromptInstructions: 'This repository is a research workspace, not a React app.\n\n',
          },
          { id: 'project-2', name: 'hello', path: '/Users/test/.manifold/projects/hello' },
          { id: 'project-3', name: 'outside', path: '/Users/test/git/outside' },
        ])
      }

      if (channel === 'settings:get') {
        return Promise.resolve({ storagePath: '/Users/test/.manifold' })
      }

      if (channel === 'simple:get-preview-url') {
        return Promise.resolve(args[0] === 'session-with-preview' ? 'http://localhost:5174/' : null)
      }

      return Promise.resolve(undefined)
    })

    const { result } = renderHook(() => useApps())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

      expect(result.current.apps).toEqual([
      expect.objectContaining({
        sessionId: 'session-no-preview',
        name: 'clock',
        status: 'idle',
        previewUrl: null,
        simpleTemplateTitle: 'Tool Researcher',
      }),
      expect.objectContaining({
        sessionId: 'session-with-preview',
        name: 'hello',
        status: 'previewing',
        previewUrl: 'http://localhost:5174/',
      }),
    ])
    expect(mockInvoke).toHaveBeenCalledWith('simple:get-preview-url', 'session-no-preview')
    expect(mockInvoke).toHaveBeenCalledWith('simple:get-preview-url', 'session-with-preview')
    expect(mockOn).toHaveBeenCalledWith('agent:status', expect.any(Function))
  })
})
