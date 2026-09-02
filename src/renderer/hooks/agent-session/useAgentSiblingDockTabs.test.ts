import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DockviewApi } from 'dockview'
import type { AgentSession } from '../../../shared/types'
import { siblingPanelId } from './agent-siblings'
import { markAgentTabDismissed, resetDismissedAgentTabs } from './dismissed-agent-tabs'
import { markAgentTabOpened, resetOpenedAgentTabs } from './opened-agent-tabs'
import { useAgentSiblingDockTabs } from './useAgentSiblingDockTabs'

beforeEach(() => {
  resetDismissedAgentTabs()
  resetOpenedAgentTabs()
})

interface MockGroup {
  element: {
    getBoundingClientRect: () => { top: number; left: number }
  }
  panels: MockPanel[]
}

interface MockPanel {
  id: string
  title?: string
  group: MockGroup
  api: {
    isActive: boolean
    setActive: ReturnType<typeof vi.fn>
    setTitle: ReturnType<typeof vi.fn>
  }
}

function buildPanel(id: string, group: MockGroup): MockPanel {
  const panel = {
    id,
    title: id,
    group,
    api: {
      isActive: false,
      setActive: vi.fn(() => {
        panel.api.isActive = true
      }),
      setTitle: vi.fn((title: string) => {
        panel.title = title
      }),
    },
  }
  group.panels.push(panel)
  return panel
}

describe('useAgentSiblingDockTabs', () => {
  it('opens new sibling tabs in the top-left workspace group', () => {
    const topLeftGroup: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 260 }) },
      panels: [],
    }
    const lowerGroup: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 180, left: 420 }) },
      panels: [],
    }

    const editorPanel = buildPanel('editor', topLeftGroup)
    const shellPanel = buildPanel('shell', topLeftGroup)
    const agentPanel = buildPanel('agent', lowerGroup)

    const panels = new Map<string, MockPanel>([
      [editorPanel.id, editorPanel],
      [shellPanel.id, shellPanel],
      [agentPanel.id, agentPanel],
    ])

    const addPanel = vi.fn()
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel,
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    const sessions: AgentSession[] = [
      {
        id: 'primary',
        projectId: 'p1',
        runtimeId: 'codex',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      },
      {
        id: 'sibling-1',
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'waiting',
        pid: 2,
        additionalDirs: [],
      },
    ]

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'primary',
      onSelectSession: vi.fn(),
    }))

    expect(addPanel).toHaveBeenCalledWith({
      id: siblingPanelId('sibling-1'),
      component: 'agent',
      title: 'Claude',
      position: { referencePanel: 'editor', direction: 'within' },
      inactive: true,
    })
  })

  it('updates existing primary and sibling tab titles from display names', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    const agentPanel = buildPanel('agent', group)
    const siblingPanel = buildPanel(siblingPanelId('sibling-1'), group)
    const panels = new Map<string, MockPanel>([
      [agentPanel.id, agentPanel],
      [siblingPanel.id, siblingPanel],
    ])
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel: vi.fn(),
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    const sessions: AgentSession[] = [
      {
        id: 'primary',
        projectId: 'p1',
        runtimeId: 'codex',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'running',
        pid: 1,
        displayName: 'Main agent',
        additionalDirs: [],
      },
      {
        id: 'sibling-1',
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'waiting',
        pid: 2,
        displayName: 'Review agent',
        additionalDirs: [],
      },
    ]

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'primary',
      onSelectSession: vi.fn(),
    }))

    expect(agentPanel.api.setTitle).toHaveBeenCalledWith('Main agent')
    expect(siblingPanel.api.setTitle).toHaveBeenCalledWith('Review agent')
  })

  it('titles the primary tab with the runtime label when the session has no display name', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    const agentPanel = buildPanel('agent', group)
    const panels = new Map<string, MockPanel>([[agentPanel.id, agentPanel]])
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel: vi.fn(),
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    const sessions: AgentSession[] = [
      {
        id: 'primary',
        projectId: 'p1',
        runtimeId: 'codex',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      },
    ]

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'primary',
      onSelectSession: vi.fn(),
    }))

    expect(agentPanel.api.setTitle).toHaveBeenCalledWith('Codex')
  })

  it('keeps the generic Agent title only when no primary session is bound', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    const agentPanel = buildPanel('agent', group)
    const panels = new Map<string, MockPanel>([[agentPanel.id, agentPanel]])
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel: vi.fn(),
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api },
      layoutVersion: 1,
      sessions: [],
      activeWorktreePath: null,
      primarySessionId: null,
      activeSessionId: null,
      onSelectSession: vi.fn(),
    }))

    expect(agentPanel.api.setTitle).toHaveBeenCalledWith('Agent')
  })

  it('does not re-activate the active sibling tab on an unrelated re-render (opening a file)', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    const agentPanel = buildPanel('agent', group)
    const siblingPanel = buildPanel(siblingPanelId('sibling-1'), group)
    siblingPanel.api.isActive = true // the sibling agent is the active tab
    const panels = new Map<string, MockPanel>([
      [agentPanel.id, agentPanel],
      [siblingPanel.id, siblingPanel],
    ])
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel: vi.fn(),
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    const sessions: AgentSession[] = [
      {
        id: 'primary',
        projectId: 'p1',
        runtimeId: 'codex',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      },
      {
        id: 'sibling-1',
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'waiting',
        pid: 2,
        additionalDirs: [],
      },
    ]

    const props = {
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'sibling-1',
      onSelectSession: vi.fn(),
    }
    const { rerender } = renderHook((p) => useAgentSiblingDockTabs(p), { initialProps: props })

    // The user opens a file: the editor takes focus, so the sibling agent tab
    // is no longer the active panel.
    siblingPanel.api.isActive = false
    siblingPanel.api.setActive.mockClear()

    // Opening a file bumps the dock layoutVersion (streaming output likewise
    // bumps `sessions`); either re-runs the effect. It must not yank focus back
    // to the agent terminal from the editor the user just opened (#296).
    rerender({ ...props, layoutVersion: 2 })

    expect(siblingPanel.api.setActive).not.toHaveBeenCalled()
  })

  it('activates the sibling tab when the active session actually changes', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    const agentPanel = buildPanel('agent', group)
    const siblingPanel = buildPanel(siblingPanelId('sibling-1'), group)
    const panels = new Map<string, MockPanel>([
      [agentPanel.id, agentPanel],
      [siblingPanel.id, siblingPanel],
    ])
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel: vi.fn(),
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi

    Object.defineProperty(api, 'panels', {
      get: () => Array.from(panels.values()),
    })

    const sessions: AgentSession[] = [
      {
        id: 'primary',
        projectId: 'p1',
        runtimeId: 'codex',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'running',
        pid: 1,
        additionalDirs: [],
      },
      {
        id: 'sibling-1',
        projectId: 'p1',
        runtimeId: 'claude',
        branchName: 'manifold/main',
        worktreePath: '/worktrees/main',
        status: 'waiting',
        pid: 2,
        additionalDirs: [],
      },
    ]

    const props = {
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'primary' as string | null,
      onSelectSession: vi.fn(),
    }
    const { rerender } = renderHook((p) => useAgentSiblingDockTabs(p), { initialProps: props })

    siblingPanel.api.setActive.mockClear()
    // The user clicks the sibling agent in the sidebar.
    rerender({ ...props, activeSessionId: 'sibling-1' })

    expect(siblingPanel.api.setActive).toHaveBeenCalled()
  })

  it('does not recreate a sibling tab the user hid, then reopens it on select', () => {
    const group: MockGroup = {
      element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
      panels: [],
    }
    // Only the primary agent panel exists — the sibling's tab was hidden.
    const agentPanel = buildPanel('agent', group)
    const panels = new Map<string, MockPanel>([[agentPanel.id, agentPanel]])
    const addPanel = vi.fn()
    const api = {
      getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
      addPanel,
      removePanel: vi.fn((panel: MockPanel) => panels.delete(panel.id)),
      onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
    } as unknown as DockviewApi
    Object.defineProperty(api, 'panels', { get: () => Array.from(panels.values()) })

    const sessions: AgentSession[] = [
      {
        id: 'primary', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/main',
        worktreePath: '/worktrees/main', status: 'running', pid: 1, additionalDirs: [],
      },
      {
        id: 'sibling-1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/main',
        worktreePath: '/worktrees/main', status: 'waiting', pid: 2, additionalDirs: [],
      },
    ]

    // The user hid the sibling's tab (AgentHeaderActions × -> closeSiblingPanel).
    markAgentTabDismissed('sibling-1')

    const props = {
      apiRef: { current: api },
      layoutVersion: 1,
      sessions,
      activeWorktreePath: '/worktrees/main',
      primarySessionId: 'primary',
      activeSessionId: 'primary' as string | null,
      onSelectSession: vi.fn(),
    }
    const { rerender } = renderHook((p) => useAgentSiblingDockTabs(p), { initialProps: props })

    // The auto-tab effect must leave the hidden sibling alone, even as it re-runs.
    expect(addPanel).not.toHaveBeenCalled()
    rerender({ ...props, layoutVersion: 2 })
    expect(addPanel).not.toHaveBeenCalled()

    // Selecting the agent from the sidebar (makes it active) un-hides its tab.
    rerender({ ...props, activeSessionId: 'sibling-1' })
    expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({ id: siblingPanelId('sibling-1') }))
  })

  describe('grouped worker tabs', () => {
    function harness(sessions: AgentSession[]) {
      const group: MockGroup = { element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) }, panels: [] }
      const agentPanel = buildPanel('agent', group)
      const panels = new Map<string, MockPanel>([[agentPanel.id, agentPanel]])
      const addPanel = vi.fn()
      const api = {
        getPanel: ((panelId: string) => panels.get(panelId)) as DockviewApi['getPanel'],
        addPanel,
        removePanel: vi.fn(),
        onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
      } as unknown as DockviewApi
      Object.defineProperty(api, 'panels', { get: () => Array.from(panels.values()) })

      renderHook(() => useAgentSiblingDockTabs({
        apiRef: { current: api },
        layoutVersion: 1,
        sessions,
        activeWorktreePath: '/wt/base',
        primarySessionId: 'viola',
        activeSessionId: 'viola',
        onSelectSession: vi.fn(),
      }))
      return { addPanel }
    }

    function worker(over: Partial<AgentSession> = {}): AgentSession {
      return {
        id: 'worker-1', projectId: 'p1', runtimeId: 'claude', branchName: 'manifold/task',
        worktreePath: '/wt/task', status: 'running', pid: 3, additionalDirs: [],
        groupId: 'viola-run-1', ...over,
      } as AgentSession
    }

    const viola: AgentSession = {
      id: 'viola', projectId: 'p1', runtimeId: 'viola', branchName: 'manifold/base',
      worktreePath: '/wt/base', status: 'waiting', pid: null, additionalDirs: [],
    } as AgentSession

    it('does not auto-open a tab for a grouped worker nobody asked for', () => {
      const { addPanel } = harness([viola, worker()])

      // A four-task run would otherwise put eight worker tabs in the dock bar.
      expect(addPanel).not.toHaveBeenCalled()
    })

    it('brings a worker tab back after a repo switch dropped its panel', () => {
      // Switching repositories reloads the one window-wide layout and strips panels whose
      // session is not in the new workspace, so returning must recreate what the user opened.
      markAgentTabOpened('worker-1')

      const { addPanel } = harness([viola, worker()])

      expect(addPanel).toHaveBeenCalledWith(expect.objectContaining({
        id: siblingPanelId('worker-1'),
        component: 'agent',
        title: 'Claude',
      }))
    })

    it('still honours hiding a worker tab the user closed', () => {
      markAgentTabOpened('worker-1')
      markAgentTabDismissed('worker-1')

      const { addPanel } = harness([viola, worker()])

      expect(addPanel).not.toHaveBeenCalled()
    })
  })
})
