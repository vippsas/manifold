import { renderHook, act } from '@testing-library/react'
import type { DockviewApi } from 'dockview'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDockLayout } from './useDockLayout'

const mockInvoke = vi.fn()

interface MockPanel {
  id: string
  component: string
  title?: string
  group?: undefined
  api: {
    isActive: boolean
    setActive: () => void
  }
}

function createApi(): DockviewApi {
  const panels = new Map<string, MockPanel>()
  panels.set('agent', {
    id: 'agent',
    component: 'agent',
    api: { isActive: true, setActive: vi.fn() },
  })

  const api = {
    get panels() {
      return []
    },
    clear: vi.fn(() => panels.clear()),
    fromJSON: vi.fn(),
    getPanel: vi.fn((id: string) => panels.get(id)),
    addPanel: vi.fn((options: { id: string; component: string; title?: string; inactive?: boolean }) => {
      const panel: MockPanel = {
        id: options.id,
        component: options.component,
        title: options.title,
        api: { isActive: !options.inactive, setActive: vi.fn() },
      }
      panels.set(options.id, panel)
      return panel
    }),
    toJSON: vi.fn(() => ({
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'workspace',
            views: [...panels.keys()],
            activeView: 'agent',
          },
        },
      },
      panels: Object.fromEntries(
        [...panels.values()].map((panel) => [
          panel.id,
          { id: panel.id, contentComponent: panel.component, title: panel.title },
        ]),
      ),
    })),
  }

  return api as unknown as DockviewApi
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDockLayout plugin panels', () => {
  it('persists plugin panels after opening them', () => {
    const api = createApi()
    const { result } = renderHook(() => useDockLayout('session-1'))

    act(() => {
      result.current.apiRef.current = api
      result.current.openPluginView('manifold.loop.panel', 'Autoresearch Loop')
      result.current.openPluginTreeView('publisher.tree', 'Plugin Tree')
    })

    // With no file open, a plugin webview pane takes the editor's spot to the
    // right of the agent (split 50/50; sidebars stay pinned).
    expect(api.addPanel).toHaveBeenCalledWith({
      id: 'manifold.loop.panel',
      component: 'pluginView',
      title: 'Autoresearch Loop',
      position: { referencePanel: 'agent', direction: 'right' },
    })
    // Tree views stay beside the agent.
    expect(api.addPanel).toHaveBeenCalledWith({
      id: 'publisher.tree',
      component: 'pluginTreeView',
      title: 'Plugin Tree',
      position: { referencePanel: 'agent', direction: 'within' },
    })

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'dock-layout:set',
      'session-1',
      expect.objectContaining({
        panels: expect.objectContaining({
          'manifold.loop.panel': expect.objectContaining({ contentComponent: 'pluginView' }),
          'publisher.tree': expect.objectContaining({ contentComponent: 'pluginTreeView' }),
        }),
      }),
    )
  })

  it('tabs a plugin webview into the editor group when a file is open', () => {
    const api = createApi()
    const { result } = renderHook(() => useDockLayout('session-1'))

    act(() => {
      result.current.apiRef.current = api
      // A file is open → an editor panel exists.
      api.addPanel({ id: 'editor', component: 'editor', title: 'Editor' })
      result.current.openPluginView('manifold.watch.panel', 'Watch')
    })

    expect(api.addPanel).toHaveBeenCalledWith({
      id: 'manifold.watch.panel',
      component: 'pluginView',
      title: 'Watch',
      position: { referencePanel: 'editor', direction: 'within' },
    })
  })

  it('flushes pending plugin layout saves before switching sessions', () => {
    const api = createApi()
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string }) => useDockLayout(sessionId),
      { initialProps: { sessionId: 'session-1' } },
    )

    act(() => {
      result.current.apiRef.current = api
      result.current.openPluginView('manifold.loop.panel', 'Autoresearch Loop')
      rerender({ sessionId: 'session-2' })
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'dock-layout:set',
      'session-1',
      expect.objectContaining({
        panels: expect.objectContaining({
          'manifold.loop.panel': expect.objectContaining({ contentComponent: 'pluginView' }),
        }),
      }),
    )

    const sessionOneSaveCount = mockInvoke.mock.calls.filter(
      ([channel, sessionId]) => channel === 'dock-layout:set' && sessionId === 'session-1',
    ).length

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(mockInvoke.mock.calls.filter(
      ([channel, sessionId]) => channel === 'dock-layout:set' && sessionId === 'session-1',
    )).toHaveLength(sessionOneSaveCount)
  })
})
