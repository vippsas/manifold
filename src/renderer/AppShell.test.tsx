import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AppShellProps } from './AppShell'
import { AppShell } from './AppShell'

vi.mock('dockview', async () => {
  const React = await import('react')
  return {
    DockviewReact: ({ onReady }: { onReady?: (event: { api: unknown }) => void }) => {
      React.useEffect(() => {
        onReady?.({ api: {} })
      }, [onReady])
      return React.createElement('div', { 'data-testid': 'dockview' })
    },
  }
})

vi.mock('./components/editor/editor-shell/dock-panels', async () => {
  const React = await import('react')
  return {
    PANEL_COMPONENTS: {},
    DockStateContext: React.createContext(null),
  }
})

vi.mock('./components/TitleBar', async () => {
  const React = await import('react')
  return { TitleBar: () => React.createElement('div', { 'data-testid': 'titlebar' }) }
})

vi.mock('./components/git/StatusBar', async () => {
  const React = await import('react')
  return { StatusBar: () => React.createElement('div', { 'data-testid': 'statusbar' }) }
})

vi.mock('./components/sidebar/DeleteAgentDialog', async () => {
  const React = await import('react')
  return { DeleteAgentDialog: () => React.createElement('div', { 'data-testid': 'delete-agent-dialog' }) }
})

vi.mock('./components/modals/SettingsModal', async () => {
  const React = await import('react')
  return { SettingsModal: () => React.createElement('div', { 'data-testid': 'settings-modal' }) }
})

vi.mock('./components/modals/AboutOverlay', async () => {
  const React = await import('react')
  return { AboutOverlay: () => React.createElement('div', { 'data-testid': 'about-overlay' }) }
})

vi.mock('./components/modals/UpdateLogOverlay', async () => {
  const React = await import('react')
  return { UpdateLogOverlay: () => React.createElement('div', { 'data-testid': 'update-log-overlay' }) }
})

vi.mock('./components/plugin-ui/PluginUiHost', async () => {
  const React = await import('react')
  return { PluginUiHost: () => React.createElement('div', { 'data-testid': 'plugin-ui-host' }) }
})

vi.mock('./plugins/use-contributions', () => ({
  useLoadPluginContributions: vi.fn(),
}))

const project = {
  id: 'p1',
  name: 'Alpha',
  path: '/repos/alpha',
  baseBranch: 'main',
  addedAt: '2024-01-01',
}

function makeProps(overrides: Partial<AppShellProps> = {}): AppShellProps {
  return {
    themeClass: 'theme-dark',
    settings: { setupCompleted: true } as AppShellProps['settings'],
    projects: [project],
    projectError: null,
    activeProjectId: 'p1',
    activeSessionId: null,
    activeSession: null,
    activeProjectIsGit: true,
    baseBranch: 'main',
    autoGenerateMessages: false,
    diff: '',
    mergedChanges: [],
    sessionsByProject: { p1: [] },
    dockState: { activeProjectId: 'p1', sessionId: null, allProjectSessions: { p1: [] } } as unknown as AppShellProps['dockState'],
    onDockReady: vi.fn(),
    dockLayoutSlot: null,
    overlays: { activePanel: null } as unknown as AppShellProps['overlays'],
    gitOps: {
      conflicts: [],
      aheadBehind: { ahead: 0, behind: 0 },
      commit: vi.fn(),
      aiGenerate: vi.fn(),
      getPRContext: vi.fn(),
      resolveConflict: vi.fn(),
      refreshAheadBehind: vi.fn(),
    },
    updateLog: {
      visible: false,
      activeTab: 'releaseNotes',
      currentVersion: '0.0.0',
      releaseNotes: null,
      log: '',
      loading: false,
      error: null,
      close: vi.fn(),
      refresh: vi.fn(),
      clear: vi.fn(),
      checkForUpdates: vi.fn(),
      openReleaseNotesExternal: vi.fn(),
      setActiveTab: vi.fn(),
      openReleaseNotes: vi.fn(),
      openDiagnostics: vi.fn(),
    },
    updateNotification: { updateReady: false, version: null, install: vi.fn(), dismiss: vi.fn() },
    themeChangeNotice: { show: false, mode: 'dark', dismiss: vi.fn() },
    appEffects: { showOnboarding: false, setShowOnboarding: vi.fn(), creatingProject: false, cloningProject: false },
    showCommitAndPrButtons: false,
    handleSelectFile: vi.fn(),
    setPreviewThemeId: vi.fn(),
    addProject: vi.fn().mockResolvedValue(null),
    cloneProject: vi.fn().mockResolvedValue(false),
    handleAddProjectFromOnboarding: vi.fn().mockResolvedValue(undefined),
    handleCloneFromOnboarding: vi.fn().mockResolvedValue(false),
    handleCreateNewProject: vi.fn().mockResolvedValue(false),
    newAgentTarget: null,
    closeNewAgentModal: vi.fn(),
    newWorkspaceVisible: true,
    setNewWorkspaceVisible: vi.fn(),
    defaultRuntime: 'claude',
    createWorkspace: vi.fn().mockResolvedValue({ id: 'w1', name: 'Workspace', projectIds: ['p1'], createdAt: '2024-01-01' }),
    workspaces: [],
    dockLayout: { isPanelVisible: () => false, togglePanel: vi.fn() },
    onRenameActiveProject: vi.fn(),
    runCommand: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: vi.fn().mockResolvedValue([]),
    on: vi.fn(() => vi.fn()),
  }
})

describe('AppShell', () => {
  it('lets the workspace modal add repositories with the default activation behavior', async () => {
    const addProject = vi.fn().mockResolvedValue({ ...project, id: 'p2', name: 'Beta', path: '/repos/beta' })

    render(<AppShell {...makeProps({ addProject })} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Add repository' }))

    await waitFor(() => {
      expect(addProject).toHaveBeenCalledTimes(1)
    })
    expect(addProject).toHaveBeenCalledWith()
  })

  it('keeps the workspace modal closed until it is asked for', () => {
    render(<AppShell {...makeProps({ newWorkspaceVisible: false })} />)

    expect(screen.queryByRole('button', { name: '+ Add repository' })).not.toBeInTheDocument()
  })

  it('keeps the dock visible while workspace creation opens in a modal', () => {
    render(<AppShell {...makeProps()} />)

    const dialog = screen.getByRole('dialog', { name: 'New Workspace' })
    expect(screen.getByTestId('dockview')).toBeInTheDocument()
    expect(dialog.parentElement).toBe(document.body)
  })

  it('keeps the dock visible while an existing workspace adds a repository', () => {
    render(<AppShell {...makeProps({
      newWorkspaceVisible: false,
      appEffects: {
        showOnboarding: true,
        setShowOnboarding: vi.fn(),
        creatingProject: false,
        cloningProject: false,
      },
    })} />)

    const dialog = screen.getByRole('dialog', { name: 'Add Repository' })
    expect(screen.getByTestId('dockview')).toBeInTheDocument()
    expect(dialog.parentElement).toBe(document.body)
  })

  it('keeps the dock visible while New Agent opens in a modal', () => {
    render(<AppShell {...makeProps({
      newWorkspaceVisible: false,
      newAgentTarget: { workspaceId: 'w1' },
      workspaces: [{ id: 'w1', name: 'Checkout', projectIds: ['p1'], createdAt: '2024-01-01' }],
      dockState: {
        activeProjectId: 'p1',
        sessionId: 's1',
        allProjectSessions: { p1: [] },
        onResumeAgent: vi.fn(),
        onLaunchWorkspaceAgent: vi.fn(),
      } as unknown as AppShellProps['dockState'],
      overlays: {
        activePanel: null,
        requestDeleteAgent: vi.fn(),
      } as unknown as AppShellProps['overlays'],
    })} />)

    expect(screen.getByTestId('dockview')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'New agent in Checkout' })).toBeInTheDocument()
  })
})
