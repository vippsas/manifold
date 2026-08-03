// An agent tab *is* its agent: the × on the primary `agent` panel (like the ×
// on a sibling tab) asks to close the agent instead of hiding the panel.
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AgentSession } from '../../../shared/types'
import { useEditorPaneHandlers } from './useEditorPaneHandlers'

const session = (id: string, projectId: string): AgentSession => ({
  id, projectId, runtimeId: 'claude', branchName: 'main',
  worktreePath: `/wt/${id}`, status: 'running', pid: 1, additionalDirs: [],
})

function setup(primarySessionId: string | null) {
  const onRequestDeleteAgent = vi.fn()
  const closePanel = vi.fn()
  const { result } = renderHook(() => useEditorPaneHandlers({
    activeSessionId: primarySessionId,
    activeProjectId: 'p1',
    primarySessionId,
    sessionsByProject: { p1: [session('s1', 'p1'), session('s2', 'p1')] },
    projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
    restoredSessionId: null,
    codeView: {
      activeEditorPaneId: null,
      handleSelectFile: vi.fn(() => 'editor'),
      setActivePane: vi.fn(),
      createPane: vi.fn(),
      moveFileToPane: vi.fn(),
      removePane: vi.fn(),
    },
    dockLayout: {
      splitEditorPane: vi.fn(() => null),
      focusPanel: vi.fn(),
      closePanel,
      editorPanelIds: [],
      findEditorPanelForSplit: vi.fn(() => null),
    },
    ensureEditorVisible: vi.fn(() => 'editor'),
    handleSelectFile: vi.fn(),
    setActiveSession: vi.fn(),
    onRequestDeleteAgent,
  }))
  return { result, onRequestDeleteAgent, closePanel }
}

describe('handleClosePanel on agent tabs', () => {
  it("asks to close the primary agent when the agent tab's × is clicked", () => {
    const { result, onRequestDeleteAgent, closePanel } = setup('s1')

    result.current.handleClosePanel('agent')

    expect(onRequestDeleteAgent).toHaveBeenCalledTimes(1)
    const [target, projectPath] = onRequestDeleteAgent.mock.calls[0]
    expect(target.id).toBe('s1')
    expect(projectPath).toBe('/repos/alpha')
    expect(closePanel).not.toHaveBeenCalled()
  })

  it('asks to close a sibling agent from its tab', () => {
    const { result, onRequestDeleteAgent, closePanel } = setup('s1')

    result.current.handleClosePanel('agent:s2')

    expect(onRequestDeleteAgent.mock.calls[0][0].id).toBe('s2')
    expect(closePanel).not.toHaveBeenCalled()
  })

  it('closes the empty agent panel as a plain panel when no agent is in it', () => {
    const { result, onRequestDeleteAgent, closePanel } = setup(null)

    result.current.handleClosePanel('agent')

    expect(onRequestDeleteAgent).not.toHaveBeenCalled()
    expect(closePanel).toHaveBeenCalledWith('agent')
  })
})
