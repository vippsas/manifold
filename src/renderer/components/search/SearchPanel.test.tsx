import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import React from 'react'
import type { UseSearchResult } from '../../hooks/useSearch'
import type { UseSearchHistoryResult } from '../../hooks/useSearchHistory'
import { DockStateContext, type DockAppState } from '../editor/dock-panel-types'
import { SearchPanel } from './SearchPanel'

const useSearchMock = vi.fn()
const useSearchHistoryMock = vi.fn()

vi.mock('../../hooks/useSearch', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
}))

vi.mock('../../hooks/useSearchHistory', () => ({
  useSearchHistory: (...args: unknown[]) => useSearchHistoryMock(...args),
}))

describe('SearchPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSearchHistoryMock.mockReturnValue(createSearchHistoryState())
  })

  it('applies a requested mode only once per focus request key', () => {
    const firstSetMode = vi.fn()
    const secondSetMode = vi.fn()

    const firstSearchState = createSearchState({
      mode: 'code',
      setMode: firstSetMode,
    })
    const secondSearchState = createSearchState({
      mode: 'memory',
      setMode: secondSetMode,
    })

    useSearchMock.mockReturnValueOnce(firstSearchState).mockReturnValueOnce(secondSearchState)

    const dockState = createDockState({
      searchFocusRequestKey: 1,
      requestedSearchMode: 'code',
    })

    const { rerender } = render(
      <DockStateContext.Provider value={dockState}>
        <SearchPanel />
      </DockStateContext.Provider>,
    )

    expect(firstSetMode).toHaveBeenCalledWith('code')

    rerender(
      <DockStateContext.Provider value={dockState}>
        <SearchPanel />
      </DockStateContext.Provider>,
    )

    expect(secondSetMode).not.toHaveBeenCalled()
  })

  it('opens the selected code result in a split pane with Alt+Enter', async () => {
    useSearchMock.mockReturnValue(createSearchState({
      query: 'auth',
      results: [{
        id: 'code-1',
        source: 'code',
        title: 'auth.ts',
        snippet: 'validateToken(token)',
        filePath: '/repo/src/auth.ts',
        rootPath: '/repo',
        relativePath: 'src/auth.ts',
        line: 12,
      }],
    }))

    const dockState = createDockState()
    const { getByPlaceholderText } = render(
      <DockStateContext.Provider value={dockState}>
        <SearchPanel />
      </DockStateContext.Provider>,
    )

    const input = getByPlaceholderText('Search code...')
    fireEvent.keyDown(input, { key: 'Enter', altKey: true })

    expect(dockState.onOpenSearchResultInSplit).toHaveBeenCalledWith({
      path: '/repo/src/auth.ts',
      line: 12,
      column: undefined,
      sessionId: undefined,
    })
  })

  it('disables Ask AI when answer mode is unavailable', () => {
    useSearchMock.mockReturnValue(createSearchState({
      query: 'auth',
      canAskAi: false,
    }))

    const { getByRole } = render(
      <DockStateContext.Provider value={createDockState()}>
        <SearchPanel />
      </DockStateContext.Provider>,
    )

    expect(getByRole('button', { name: 'Ask AI' })).toBeDisabled()
  })
})

function createSearchState(overrides: Partial<UseSearchResult> = {}): UseSearchResult {
  return {
    context: {
      projectId: 'project-1',
      activeSessionId: 'session-1',
      sessions: [{
        sessionId: 'session-1',
        branchName: 'feature/search',
        runtimeId: 'codex',
        worktreePath: '/repo/.manifold/worktrees/feature-search',
        additionalDirs: [],
        status: 'running',
      }],
    },
    mode: 'code',
    setMode: vi.fn(),
    query: '',
    setQuery: vi.fn(),
    scopeKind: 'active-session',
    setScopeKind: vi.fn(),
    matchMode: 'literal',
    setMatchMode: vi.fn(),
    caseSensitive: false,
    setCaseSensitive: vi.fn(),
    wholeWord: false,
    setWholeWord: vi.fn(),
    memoryTypeFilter: null,
    setMemoryTypeFilter: vi.fn(),
    memoryConceptFilter: null,
    setMemoryConceptFilter: vi.fn(),
    results: [],
    warnings: [],
    isSearching: false,
    canAskAi: true,
    aiAnswer: null,
    isAsking: false,
    ask: vi.fn(async () => {}),
    clearAiAnswer: vi.fn(),
    aiError: null,
    error: null,
    ...overrides,
  }
}

function createSearchHistoryState(overrides: Partial<UseSearchHistoryResult> = {}): UseSearchHistoryResult {
  return {
    savedSearches: [],
    recentSearches: [],
    currentSavedSearchId: null,
    toggleSaveCurrentSearch: vi.fn(async () => {}),
    applySearchEntry: vi.fn(async () => {}),
    markCurrentSearchUsed: vi.fn(async () => {}),
    ...overrides,
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
