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
      makePanel('editor:1', topLeftGroup),
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
  interface MockGroup {
    element: { offsetWidth: number }
    api: { setConstraints: ReturnType<typeof vi.fn> }
  }
  const makeGroup = (offsetWidth: number): MockGroup => ({
    element: { offsetWidth },
    api: { setConstraints: vi.fn() },
  })

  it('pins sidebar widths in place (no fromJSON remount) across a structural change', () => {
    let layout = createWorkspaceLayout()
    const fromJSON = vi.fn((json: SerializedDockview) => { layout = json })
    const projectsGroup = makeGroup(200)
    const filesGroup = makeGroup(200)
    const centerGroup = makeGroup(600)
    const api = {
      width: 1000,
      groups: [projectsGroup, centerGroup, filesGroup],
      toJSON: vi.fn(() => layout),
      fromJSON,
      getPanel: vi.fn((panelId: string) => {
        if (panelId === 'projects') return { group: projectsGroup }
        if (panelId === 'fileTree') return { group: filesGroup }
        return undefined
      }),
    } as unknown as DockviewApi

    applyLayoutChangePreservingSidebarWidths(api, () => {
      // Structural change: add a panel so the grid signature differs.
      const next = createWorkspaceLayout(260, 490, 250)
      const root = next.grid.root as { type: 'branch'; data: Array<{ type: 'leaf'; data: { views: string[] } }> }
      root.data[1].data.views = [...root.data[1].data.views, 'shell']
      layout = next
    })

    // Widths are held via group constraints — never by reloading the
    // serialized layout (which would remount every panel and flash xterm).
    expect(fromJSON).not.toHaveBeenCalled()
    expect(projectsGroup.api.setConstraints).toHaveBeenCalledWith({ minimumWidth: 200, maximumWidth: 200 })
    expect(filesGroup.api.setConstraints).toHaveBeenCalledWith({ minimumWidth: 200, maximumWidth: 200 })
    // Each pinned sidebar is then released back to free resize.
    expect(projectsGroup.api.setConstraints).toHaveBeenLastCalledWith({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
    expect(filesGroup.api.setConstraints).toHaveBeenLastCalledWith({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
  })

  it('pins both sidebars before the structural mutation runs, not after', () => {
    // The fix: dockview only honours group constraints during the layout pass
    // that addPanel/removePanel triggers, so the sidebars must already be
    // pinned by the time applyChange runs. Pinning afterwards is a no-op and
    // lets both sidebars drift (the reported bug).
    let layout = createWorkspaceLayout()
    const projectsGroup = makeGroup(200)
    const filesGroup = makeGroup(200)
    const centerGroup = makeGroup(600)
    const api = {
      width: 1000,
      groups: [projectsGroup, centerGroup, filesGroup],
      toJSON: vi.fn(() => layout),
      fromJSON: vi.fn(),
      getPanel: vi.fn((panelId: string) => {
        if (panelId === 'projects') return { group: projectsGroup }
        if (panelId === 'fileTree') return { group: filesGroup }
        return undefined
      }),
    } as unknown as DockviewApi

    const wasPinned = (group: typeof projectsGroup): boolean =>
      group.api.setConstraints.mock.calls.some(([c]) => c.maximumWidth === 200)

    let pinnedDuringChange: [boolean, boolean] | undefined
    applyLayoutChangePreservingSidebarWidths(api, () => {
      pinnedDuringChange = [wasPinned(projectsGroup), wasPinned(filesGroup)]
      const next = createWorkspaceLayout(260, 490, 250)
      const root = next.grid.root as { type: 'branch'; data: Array<{ data: { views: string[] } }> }
      root.data[1].data.views = [...root.data[1].data.views, 'shell']
      layout = next
    })

    expect(pinnedDuringChange).toEqual([true, true])
    // Both sidebars are released again afterwards (free to resize).
    expect(projectsGroup.api.setConstraints).toHaveBeenLastCalledWith({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
    expect(filesGroup.api.setConstraints).toHaveBeenLastCalledWith({ minimumWidth: 0, maximumWidth: Number.MAX_SAFE_INTEGER })
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
