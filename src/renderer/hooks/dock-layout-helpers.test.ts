import { describe, expect, it, vi } from 'vitest'
import type { DockviewApi, SerializedDockview } from 'dockview'
import { Orientation } from 'dockview-core'
import {
  applyLayoutChangePreservingSidebarWidths,
  findAdjacentEditorPanelId,
  sanitizeDockLayout,
  showPanelFromHints,
} from './dock-layout-helpers'

function createWorkspaceLayout(left = 200, center = 600, right = 200): SerializedDockview {
  return {
    grid: {
      root: {
        type: 'branch',
        size: 1000,
        data: [
          {
            type: 'leaf',
            size: left,
            data: {
              id: 'projects-group',
              views: ['projects'],
              activeView: 'projects',
            },
          },
          {
            type: 'leaf',
            size: center,
            data: {
              id: 'workspace',
              views: ['agent', 'editor'],
              activeView: 'editor',
            },
          },
          {
            type: 'leaf',
            size: right,
            data: {
              id: 'files-group',
              views: ['fileTree', 'modifiedFiles'],
              activeView: 'fileTree',
            },
          },
        ],
      },
    },
    panels: {
      projects: {},
      agent: {},
      editor: {},
      fileTree: {},
      modifiedFiles: {},
    },
  } as unknown as SerializedDockview
}

describe('findAdjacentEditorPanelId', () => {
  it('finds an existing editor pane to the right of the active pane', () => {
    expect(findAdjacentEditorPanelId(
      Orientation.HORIZONTAL,
      [0],
      [
        { panelId: 'editor:1', location: [1] },
        { panelId: 'editor:2', location: [0, 1] },
      ],
      'right',
    )).toBe('editor:1')
  })

  it('finds an existing editor pane below the active pane', () => {
    expect(findAdjacentEditorPanelId(
      Orientation.HORIZONTAL,
      [0],
      [
        { panelId: 'editor:1', location: [1] },
        { panelId: 'editor:2', location: [0, 1] },
      ],
      'below',
    )).toBe('editor:2')
  })
})

describe('sanitizeDockLayout', () => {
  it('removes the retired memory panel from saved layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 320,
              data: {
                id: 'sidebar',
                views: ['fileTree', 'modifiedFiles', 'memory'],
                activeView: 'memory',
              },
            },
            {
              type: 'leaf',
              size: 680,
              data: {
                id: 'workspace',
                views: ['agent', 'search'],
                activeView: 'agent',
              },
            },
          ],
        },
      },
      panels: {
        fileTree: {},
        modifiedFiles: {},
        memory: {},
        agent: {},
        search: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const sidebar = (sanitized.grid.root as {
      type: 'branch'
      data: Array<{ type: 'leaf'; data: { views: string[]; activeView?: string } }>
    }).data[0]

    expect(sanitized).not.toBeNull()
    expect(Object.keys(sanitized.panels)).not.toContain('memory')
    expect(sidebar.data.views).toEqual(['fileTree', 'modifiedFiles'])
    expect(sidebar.data.activeView).toBe('fileTree')
  })

  it('returns null when the saved layout only contains retired panels', () => {
    const saved = {
      grid: {
        root: {
          type: 'leaf',
          size: 1000,
          data: {
            id: 'memory-only',
            views: ['memory'],
            activeView: 'memory',
          },
        },
      },
      panels: {
        memory: {},
      },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBeNull()
  })

  it('removes empty groups and unsupported panels from corrupted layouts', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 300,
              data: {
                id: 'empty-left',
                views: [],
                activeView: 'projects',
              },
            },
            {
              type: 'leaf',
              size: 700,
              data: {
                id: 'workspace',
                views: ['agent', 'search', 'unsupportedPanel'],
                activeView: 'unsupportedPanel',
              },
            },
          ],
        },
      },
      panels: {
        projects: {},
        agent: {},
        search: {},
        unsupportedPanel: {},
      },
    } as unknown as SerializedDockview

    const sanitized = sanitizeDockLayout(saved) as SerializedDockview
    const root = sanitized.grid.root as {
      type: 'leaf'
      data: { views: string[]; activeView?: string }
    }

    expect(sanitized).not.toBeNull()
    expect(root.type).toBe('leaf')
    expect(root.data.views).toEqual(['agent', 'search'])
    expect(root.data.activeView).toBe('agent')
    expect(Object.keys(sanitized.panels)).toEqual(['agent', 'search'])
  })

  it('returns null when every grid leaf is empty after sanitization', () => {
    const saved = {
      grid: {
        root: {
          type: 'branch',
          size: 1000,
          data: [
            {
              type: 'leaf',
              size: 500,
              data: {
                id: 'left',
                views: [],
                activeView: 'projects',
              },
            },
            {
              type: 'leaf',
              size: 500,
              data: {
                id: 'right',
                views: ['unsupportedPanel'],
                activeView: 'unsupportedPanel',
              },
            },
          ],
        },
      },
      panels: {
        unsupportedPanel: {},
      },
    } as unknown as SerializedDockview

    expect(sanitizeDockLayout(saved)).toBeNull()
  })
})

describe('applyLayoutChangePreservingSidebarWidths', () => {
  it('restores left and right sidebar widths after a structural layout change', () => {
    let layout = createWorkspaceLayout()
    const fromJSON = vi.fn((json: SerializedDockview) => {
      layout = json
    })
    const api = {
      width: 1000,
      toJSON: vi.fn(() => layout),
      fromJSON,
      getPanel: vi.fn((panelId: string) => {
        if (panelId === 'projects') return { group: { element: { offsetWidth: 200 } } }
        if (panelId === 'fileTree') return { group: { element: { offsetWidth: 200 } } }
        return undefined
      }),
    } as unknown as DockviewApi

    applyLayoutChangePreservingSidebarWidths(api, () => {
      layout = createWorkspaceLayout(260, 490, 250)
    })

    expect(fromJSON).toHaveBeenCalledTimes(1)
    const root = layout.grid.root as {
      type: 'branch'
      data: Array<{ size: number }>
    }
    expect(root.data.map((node) => node.size)).toEqual([200, 600, 200])
  })
})

describe('showPanelFromHints', () => {
  it('restores the editor into the existing agent tab group', () => {
    const agentPanel = { id: 'agent' }
    const addPanel = vi.fn()
    const api = {
      width: 0,
      getPanel: vi.fn((id: string) => (id === 'agent' ? agentPanel : undefined)),
      addPanel,
    }

    showPanelFromHints(api as never, 'editor')

    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      position: { referencePanel: agentPanel, direction: 'within' },
    })
  })

  it('restores the agent into the existing editor tab group', () => {
    const editorPanel = { id: 'editor' }
    const addPanel = vi.fn()
    const api = {
      width: 0,
      getPanel: vi.fn((id: string) => (id === 'editor' ? editorPanel : undefined)),
      addPanel,
    }

    showPanelFromHints(api as never, 'agent')

    expect(addPanel).toHaveBeenCalledWith({
      id: 'agent',
      component: 'agent',
      title: 'Agent',
      position: { referencePanel: editorPanel, direction: 'within' },
    })
  })
})
