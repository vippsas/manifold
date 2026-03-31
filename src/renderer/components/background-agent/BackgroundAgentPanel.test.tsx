import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import type { BackgroundAgentSnapshot } from '../../../../background-agent/schemas/background-agent-types'
import { DockStateContext, type DockAppState } from '../editor/dock-panel-types'
import { BackgroundAgentPanel } from './BackgroundAgentPanel'

const useBackgroundAgentMock = vi.fn()

vi.mock('../../hooks/useBackgroundAgent', () => ({
  useBackgroundAgent: (...args: unknown[]) => useBackgroundAgentMock(...args),
}))

describe('BackgroundAgentPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an empty state when no project is selected', () => {
    useBackgroundAgentMock.mockReturnValue(createBackgroundAgentState())

    render(
      <DockStateContext.Provider value={createDockState({ activeProjectId: null })}>
        <BackgroundAgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('Select a project to get ideas.')).toBeInTheDocument()
  })

  it('renders evidence, source details, and all feedback actions', () => {
    useBackgroundAgentMock.mockReturnValue(createBackgroundAgentState({
      snapshot: createSnapshot(),
      status: createSnapshot().status,
    }))

    render(
      <DockStateContext.Provider value={createDockState()}>
        <BackgroundAgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByText('Ship ecosystem watch cards')).toBeInTheDocument()
    expect(screen.getByText(/Why now:/i)).toBeInTheDocument()
    expect(screen.getByText(/release note pattern worth tracking/i)).toBeInTheDocument()
    expect(screen.getByText(/2026-03-30 · official docs · high trust/i)).toBeInTheDocument()
    expect(screen.getByText('A concrete snippet from the source.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh Ideas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Clear Ideas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Weak Evidence' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bad Timing' })).toBeInTheDocument()
  })

  it('does not repeat the current detail line inside recent activity', () => {
    useBackgroundAgentMock.mockReturnValue(createBackgroundAgentState({
      snapshot: {
        ...createSnapshot(),
        status: {
          phase: 'researching',
          isRefreshing: true,
          refreshState: 'running',
          lastRefreshedAt: null,
          error: null,
          summary: 'Searching the web for competitor feature patterns.',
          detail: 'Query: Developer tool Highlights feature patterns changelog',
          stepLabel: 'Topic 1 of 4',
          recentActivity: [
            'Built a local project profile.',
            'Prepared 4 research topics for external research.',
            'Query: Developer tool Highlights feature patterns changelog',
            'Searching the web for competitor feature patterns.',
          ],
        },
      },
      status: {
        phase: 'researching',
        isRefreshing: true,
        refreshState: 'running',
        lastRefreshedAt: null,
        error: null,
        summary: 'Searching the web for competitor feature patterns.',
        detail: 'Query: Developer tool Highlights feature patterns changelog',
        stepLabel: 'Topic 1 of 4',
        recentActivity: [
          'Built a local project profile.',
          'Prepared 4 research topics for external research.',
          'Query: Developer tool Highlights feature patterns changelog',
          'Searching the web for competitor feature patterns.',
        ],
      },
      isRefreshing: true,
    }))

    render(
      <DockStateContext.Provider value={createDockState()}>
        <BackgroundAgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getAllByText('Query: Developer tool Highlights feature patterns changelog')).toHaveLength(1)
  })

  it('uses compact controls for paused refreshes', () => {
    useBackgroundAgentMock.mockReturnValue(createBackgroundAgentState({
      snapshot: {
        ...createSnapshot(),
        status: {
          ...createSnapshot().status,
          phase: 'researching',
          isRefreshing: false,
          refreshState: 'paused',
          summary: 'Ideas refresh paused.',
          detail: 'Resume to continue with 3 remaining research topics.',
          stepLabel: 'Paused after topic 1 of 4',
          recentActivity: ['Paused the Ideas refresh.'],
        },
      },
    }))

    render(
      <DockStateContext.Provider value={createDockState()}>
        <BackgroundAgentPanel />
      </DockStateContext.Provider>,
    )

    expect(screen.getByRole('button', { name: 'Resume Ideas' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Stop Refresh' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clear Ideas' })).toBeInTheDocument()
  })
})

function createBackgroundAgentState(overrides: Record<string, unknown> = {}) {
  const snapshot = overrides.snapshot as BackgroundAgentSnapshot | null | undefined
  return {
    snapshot: snapshot ?? null,
    suggestions: snapshot?.suggestions ?? [],
    status: snapshot?.status ?? null,
    isLoading: false,
    isRefreshing: false,
    isClearing: false,
    error: null,
    refresh: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    submitFeedback: vi.fn(async () => {}),
    ...overrides,
  }
}

function createSnapshot(): BackgroundAgentSnapshot {
  return {
    profile: {
      projectId: 'project-1',
      projectName: 'Manifold',
      projectPath: '/repo',
      summary: 'An Electron app for agentic developer workflows.',
      productType: 'Developer tool',
      targetUser: 'Developers',
      majorWorkflows: ['Ideas research'],
      architectureShape: 'Electron desktop app with separate main and renderer layers',
      dependencyStack: ['electron', 'react', 'dockview'],
      openQuestions: ['How should the Ideas tab surface ecosystem shifts?'],
      recentChanges: ['Recent work: Added the Ideas tab to the agent workspace'],
      sourcePaths: ['README.md'],
      generatedAt: '2026-03-31T07:00:00.000Z',
    },
    suggestions: [{
      id: 'suggestion-1',
      title: 'Ship ecosystem watch cards',
      category: 'ecosystem_shift',
      summary: 'Track meaningful dependency and platform changes directly in the Ideas feed.',
      whyItMatters: 'This project already researches external signals and should make them easier to scan.',
      whyNow: 'Electron 35 introduced a release note pattern worth tracking.',
      supportingSources: [{
        id: 'source-1',
        title: 'Electron Release Notes',
        url: 'https://example.com/electron-release',
        type: 'official_docs',
        trust: 'high',
        publishedAt: '2026-03-30',
        note: 'A concrete snippet from the source.',
      }, {
        id: 'source-2',
        title: 'Engineering Write-up',
        url: 'https://engineering.example.com/post',
        type: 'engineering_blog',
        trust: 'medium',
        publishedAt: '2026-03-28',
        note: 'A corroborating write-up.',
      }],
      evidence: ['Electron teams increasingly communicate changes through detailed release notes.'],
      confidence: 'high',
      novelty: 'medium',
      effort: 'medium',
      impact: 'high',
      createdAt: '2026-03-31T07:00:00.000Z',
    }],
    status: {
      phase: 'ready',
      isRefreshing: false,
      refreshState: 'idle',
      lastRefreshedAt: '2026-03-31T07:00:00.000Z',
      error: null,
      summary: 'Prepared 1 source-backed idea.',
      detail: 'The Ideas feed is ready to review.',
      stepLabel: 'Step 4 of 4',
      recentActivity: ['Ranked and stored 1 idea card.'],
    },
  }
}

function createDockState(overrides: Partial<DockAppState> = {}): DockAppState {
  return {
    sessionId: 'session-1',
    searchFocusRequestKey: 0,
    requestedSearchMode: null,
    scrollbackLines: 1000,
    diffText: '',
    openFiles: [],
    activeFilePath: null,
    activeEditorPaneId: null,
    editorPaneIds: [],
    getEditorPane: vi.fn(),
    lastFileOpenRequest: { path: null, source: 'default' },
    theme: 'dark',
    onSelectFile: vi.fn(),
    onOpenSearchResult: vi.fn(),
    onOpenSearchResultInSplit: vi.fn(),
    onSelectFileFromFileTree: vi.fn(),
    onSelectOpenFile: vi.fn(),
    onSelectFileFromMarkdownPreview: vi.fn(),
    onCloseFile: vi.fn(),
    onSaveFile: vi.fn(),
    onRegisterEditorPane: vi.fn(),
    onActivateEditorPane: vi.fn(),
    onSplitEditorPane: vi.fn(),
    onMoveFileToPane: vi.fn(),
    tree: null,
    primaryBranch: null,
    changes: [],
    expandedPaths: new Set<string>(),
    onToggleExpand: vi.fn(),
    worktreeRoot: null,
    worktreeShellSessionId: null,
    projectShellSessionId: null,
    worktreeCwd: null,
    shellBranchName: null,
    shellProjectName: null,
    baseBranch: 'main',
    defaultRuntime: 'codex',
    onLaunchAgent: vi.fn(),
    projects: [],
    activeProjectId: 'project-1',
    allProjectSessions: {},
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onRemoveProject: vi.fn(),
    onUpdateProject: vi.fn(),
    onDeleteAgent: vi.fn(),
    onNewAgentFromHeader: vi.fn(),
    newAgentFocusTrigger: 0,
    onNewProject: vi.fn(),
    fetchingProjectId: null,
    lastFetchedProjectId: null,
    fetchResult: null,
    fetchError: null,
    onFetchProject: vi.fn(),
    activeSessionStatus: null,
    activeSessionRuntimeId: null,
    onResumeAgent: vi.fn(),
    previewUrl: null,
    onShowSearchPanel: vi.fn(),
    onClosePanel: vi.fn(),
    ...overrides,
  }
}
