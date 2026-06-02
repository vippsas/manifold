import { describe, expect, it, vi } from 'vitest'
import type { DockviewApi, SerializedDockview } from 'dockview'
import { Orientation } from 'dockview-core'
import {
  applyLayoutChangePreservingSidebarWidths,
  findAdjacentEditorPanelId,
  findTopLeftWorkspaceReferencePanel,
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

describe('findTopLeftWorkspaceReferencePanel', () => {
  it('picks the visually top-left workspace group and ignores sidebar groups', () => {
    interface MockGroup {
      element: {
        getBoundingClientRect: () => { top: number; left: number }
      }
      panels: MockPanel[]
    }

    interface MockPanel {
      id: string
      group: MockGroup
    }

    const makeGroup = (top: number, left: number): MockGroup => ({
      element: {
        getBoundingClientRect: () => ({ top, left }),
      },
      panels: [],
    })

    const projectsGroup = makeGroup(0, 0)
    const topLeftGroup = makeGroup(0, 320)
    const lowerGroup = makeGroup(200, 420)
    const filesGroup = makeGroup(0, 1220)

    const makePanel = (id: string, group: MockGroup): MockPanel => {
      const panel = { id, group }
      group.panels.push(panel)
      return panel
    }

    const panels = [
      makePanel('projects', projectsGroup),
      makePanel('editor', topLeftGroup),
      makePanel('backgroundAgent', topLeftGroup),
      makePanel('agent', lowerGroup),
      makePanel('shell', lowerGroup),
      makePanel('fileTree', filesGroup),
    ]

    const api = {
      panels,
      getPanel: vi.fn((panelId: string) => panels.find((panel) => panel.id === panelId)),
    } as unknown as DockviewApi

    expect(findTopLeftWorkspaceReferencePanel(api)).toBe('editor')
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
      const next = createWorkspaceLayout(260, 490, 250)
      // Mutate structure (add a panel to the workspace group) so the grid
      // signature differs from the original.
      const root = next.grid.root as {
        type: 'branch'
        data: Array<{ type: 'leaf'; data: { views: string[] } }>
      }
      const workspaceGroup = root.data[1]
      workspaceGroup.data.views = [...workspaceGroup.data.views, 'shell']
      layout = next
    })

    expect(fromJSON).toHaveBeenCalledTimes(1)
    const root = layout.grid.root as {
      type: 'branch'
      data: Array<{ size: number }>
    }
    expect(root.data.map((node) => node.size)).toEqual([200, 600, 200])
  })

  it('skips fromJSON when applyChange leaves the grid structure untouched', () => {
    // A filetree click runs ensureEditorPanel even when the editor is already
    // present in a different group, so applyChange is structurally a no-op.
    // In that case we must not re-deserialize the layout — doing so remounts
    // dockview panels and tears down xterm in the agent pane.
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
      // no structural change
    })

    expect(fromJSON).not.toHaveBeenCalled()
  })
})

describe('showPanelFromHints', () => {
  const emptyLayout: SerializedDockview = {
    grid: { root: { type: 'branch', size: 0, data: [] } },
    panels: {},
  } as unknown as SerializedDockview

  it('restores the editor beside the existing agent panel', () => {
    const agentPanel = { id: 'agent' }
    const addPanel = vi.fn()
    const api = {
      width: 0,
      getPanel: vi.fn((id: string) => (id === 'agent' ? agentPanel : undefined)),
      addPanel,
      toJSON: vi.fn(() => emptyLayout),
      fromJSON: vi.fn(),
    }

    showPanelFromHints(api as never, 'editor')

    expect(addPanel).toHaveBeenCalledWith({
      id: 'editor',
      component: 'editor',
      title: 'Editor',
      position: { referencePanel: agentPanel, direction: 'right' },
    })
  })

  it('restores the agent beside the existing editor panel', () => {
    const editorPanel = { id: 'editor' }
    const addPanel = vi.fn()
    const api = {
      width: 0,
      getPanel: vi.fn((id: string) => (id === 'editor' ? editorPanel : undefined)),
      addPanel,
      toJSON: vi.fn(() => emptyLayout),
      fromJSON: vi.fn(),
    }

    showPanelFromHints(api as never, 'agent')

    expect(addPanel).toHaveBeenCalledWith({
      id: 'agent',
      component: 'agent',
      title: 'Agent',
      position: { referencePanel: editorPanel, direction: 'left' },
    })
  })
})
