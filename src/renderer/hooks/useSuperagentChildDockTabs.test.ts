import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DockviewApi } from 'dockview'
import type { Project, AgentSession } from '../../shared/types'
import type { Superagent } from '../../shared/superagent-types'
import { siblingPanelId } from './agent-siblings'
import { useSuperagentChildDockTabs } from './useSuperagentChildDockTabs'

interface MockGroup {
  id: string
  panels: MockPanel[]
}

interface MockPanel {
  id: string
  title?: string
  group: MockGroup
  api: {
    group: MockGroup
    isActive: boolean
    setActive: ReturnType<typeof vi.fn>
    setTitle: ReturnType<typeof vi.fn>
    moveTo: ReturnType<typeof vi.fn>
  }
}

function buildMockDockview() {
  const superagentGroup: MockGroup = { id: 'superagent', panels: [] }
  const secondaryGroup: MockGroup = { id: 'secondary', panels: [] }
  const panels = new Map<string, MockPanel>()
  let activePanelHandler: ((panel: MockPanel | undefined) => void) | null = null

  const insertPanel = (group: MockGroup, panel: MockPanel, index?: number): void => {
    const currentIndex = panel.group.panels.indexOf(panel)
    if (currentIndex >= 0) panel.group.panels.splice(currentIndex, 1)

    panel.group = group
    panel.api.group = group
    const nextIndex = Math.max(0, Math.min(index ?? group.panels.length, group.panels.length))
    group.panels.splice(nextIndex, 0, panel)
  }

  const createPanel = (id: string, title: string | undefined, group: MockGroup): MockPanel => {
    const panel = {
      id,
      title,
      group,
      api: {
        group,
        isActive: false,
        setActive: vi.fn(() => {
          panel.api.isActive = true
          activePanelHandler?.(panel)
        }),
        setTitle: vi.fn((nextTitle: string) => {
          panel.title = nextTitle
        }),
        moveTo: vi.fn((options: { group?: MockGroup; index?: number }) => {
          insertPanel(options.group ?? panel.group, panel, options.index)
        }),
      },
    }
    return panel
  }

  const agentPanel = createPanel('agent', 'kubedeployerv2', superagentGroup)
  const editorPanel = createPanel('editor', 'Editor', superagentGroup)
  const searchPanel = createPanel('search', 'Search', superagentGroup)
  panels.set(agentPanel.id, agentPanel)
  panels.set(editorPanel.id, editorPanel)
  panels.set(searchPanel.id, searchPanel)
  superagentGroup.panels.push(agentPanel, editorPanel, searchPanel)

  const api: DockviewApi = {
    getPanel: ((id: string) => panels.get(id)) as DockviewApi['getPanel'],
    addPanel: ((options: {
      id: string
      title?: string
      position?: { index?: number }
    }) => {
      const panel = createPanel(options.id, options.title, superagentGroup)
      panels.set(panel.id, panel)
      insertPanel(superagentGroup, panel, options.position?.index)
      return panel
    }) as DockviewApi['addPanel'],
    removePanel: ((panel: MockPanel) => {
      const groupIndex = panel.group.panels.indexOf(panel)
      if (groupIndex >= 0) panel.group.panels.splice(groupIndex, 1)
      panels.delete(panel.id)
    }) as DockviewApi['removePanel'],
    onDidActivePanelChange: ((handler: (panel: MockPanel | undefined) => void) => {
      activePanelHandler = handler
      return {
        dispose() {
          if (activePanelHandler === handler) activePanelHandler = null
        },
      }
    }) as DockviewApi['onDidActivePanelChange'],
  } as DockviewApi

  Object.defineProperty(api, 'panels', {
    get: () => Array.from(panels.values()),
  })

  return {
    apiRef: { current: api },
    superagentGroup,
    secondaryGroup,
    createDetachedPanel(id: string, title: string): MockPanel {
      const panel = createPanel(id, title, secondaryGroup)
      panels.set(panel.id, panel)
      secondaryGroup.panels.push(panel)
      return panel
    },
    emitActivePanel(id: string): void {
      activePanelHandler?.(panels.get(id))
    },
  }
}

const projects: Project[] = [
  { id: 'p1', name: 'k8s-app-conf', path: '/repos/k8s-app-conf', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'kubedeploy', path: '/repos/kubedeploy', baseBranch: 'main', addedAt: '2024-01-01' },
]

const superagent: Superagent = {
  id: 'sa-1',
  name: 'kubedeployerv2',
  taskDescription: '',
  runtimeId: 'codex',
  fleetProjectIds: ['p1', 'p2'],
  fleetWorktreePaths: {},
  branchName: 'manifold/kubedeployerv2',
  childSessionIds: ['s1', 's2'],
  coordinationPath: '/coordination',
  createdAt: '2024-01-01T00:00:00.000Z',
  pid: 1,
  status: 'running',
  autoApprove: false,
}

const allProjectSessions: Record<string, AgentSession[]> = {
  p1: [{
    id: 's1',
    projectId: 'p1',
    runtimeId: 'codex',
    branchName: 'manifold/kubedeployerv2',
    worktreePath: '/worktrees/k8s-app-conf/manifold-kubedeployerv2',
    status: 'running',
    pid: 1,
    additionalDirs: [],
    parentSuperagentId: 'sa-1',
  }],
  p2: [{
    id: 's2',
    projectId: 'p2',
    runtimeId: 'codex',
    branchName: 'manifold/kubedeployerv2',
    worktreePath: '/worktrees/kubedeploy/manifold-kubedeployerv2',
    status: 'waiting',
    pid: 2,
    additionalDirs: [],
    parentSuperagentId: 'sa-1',
  }],
}

describe('useSuperagentChildDockTabs', () => {
  it('keeps superagent child tabs clustered after the superagent tab', () => {
    const dockview = buildMockDockview()
    dockview.createDetachedPanel(siblingPanelId('s1'), 'old-k8s')

    renderHook(() => useSuperagentChildDockTabs({
      apiRef: dockview.apiRef,
      layoutVersion: 1,
      superagent,
      projects,
      allProjectSessions,
      onSelectChildSession: vi.fn(),
      onSelectSuperagentHome: vi.fn(),
    }))

    expect(dockview.superagentGroup.panels.map((panel) => panel.id)).toEqual([
      'agent',
      siblingPanelId('s1'),
      siblingPanelId('s2'),
      'editor',
      'search',
    ])
  })

  it('keeps existing sibling panels during a stale-session-list window', () => {
    // Reproduces the focus-jumps-to-Search bug: after a user clicks a
    // sub-agent that lives in a different project, setActiveProject triggers
    // an async session refetch. Until that completes, sessionsByProject for
    // the new project is stale, so resolveChildSessions can't find the
    // clicked session and drops it from `childSessions`. The effect must
    // still keep the existing panel — removing the active panel would make
    // dockview auto-activate a neighbor (Search), stealing focus.
    const dockview = buildMockDockview()

    // Seed the layout with both sibling panels (the steady-state).
    renderHook(() => useSuperagentChildDockTabs({
      apiRef: dockview.apiRef,
      layoutVersion: 1,
      superagent,
      projects,
      allProjectSessions,
      onSelectChildSession: vi.fn(),
      onSelectSuperagentHome: vi.fn(),
    }))

    // Now simulate the stale window: superagent.childSessionIds still lists
    // both, but allProjectSessions is missing the data for s1's project.
    const staleAllProjectSessions: Record<string, AgentSession[]> = {
      p1: [],
      p2: allProjectSessions.p2,
    }

    renderHook(() => useSuperagentChildDockTabs({
      apiRef: dockview.apiRef,
      layoutVersion: 2,
      superagent,
      projects,
      allProjectSessions: staleAllProjectSessions,
      onSelectChildSession: vi.fn(),
      onSelectSuperagentHome: vi.fn(),
    }))

    expect(dockview.superagentGroup.panels.map((panel) => panel.id)).toContain(
      siblingPanelId('s1'),
    )
  })

  it('syncs dock tab activation back into superagent navigation callbacks', () => {
    const dockview = buildMockDockview()
    const onSelectChildSession = vi.fn()
    const onSelectSuperagentHome = vi.fn()

    renderHook(() => useSuperagentChildDockTabs({
      apiRef: dockview.apiRef,
      layoutVersion: 1,
      superagent,
      projects,
      allProjectSessions,
      onSelectChildSession,
      onSelectSuperagentHome,
    }))

    dockview.emitActivePanel(siblingPanelId('s2'))
    expect(onSelectChildSession).toHaveBeenCalledWith('s2', 'p2')

    dockview.emitActivePanel('agent')
    expect(onSelectSuperagentHome).toHaveBeenCalledTimes(1)
  })
})
