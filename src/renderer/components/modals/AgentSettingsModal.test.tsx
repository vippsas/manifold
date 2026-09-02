import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { AgentSettingsModal } from './AgentSettingsModal'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import type { DockAppState } from '../editor/editor-shell/dock-panel-types'
import type { AgentSession } from '../../../shared/types'
import type { RegisteredPanel } from '../../plugins/contribution-registry'

// Apps moved from the "+ Apps" header launcher into the agent's options: the
// modal lists the launcher contributions for the active session's worktree.
const mockContributions = vi.fn((): RegisteredPanel[] => [])
vi.mock('../../plugins/use-contributions', () => ({
  useLauncherContributions: () => mockContributions(),
}))

const internalPanel: RegisteredPanel = { id: 'demo', title: 'Demo', description: 'A demo internal panel.', launcher: true, source: 'internal' }
const pluginPanel: RegisteredPanel = { id: 'manifold.statistics.panel', title: 'Statistics', description: 'Stats.', launcher: true, source: 'plugin', kind: 'webview' }

const session: AgentSession = {
  id: 's1',
  projectId: 'p1',
  runtimeId: 'claude',
  branchName: 'manifold/oslo',
  worktreePath: '/wt1',
  status: 'running',
  pid: 1,
  additionalDirs: [],
}

function renderModal(stateOverrides: Partial<DockAppState>, onClose = vi.fn()) {
  const state = {
    sessionId: 's1',
    onOpenModule: vi.fn(),
    onOpenPluginView: vi.fn(),
    onOpenPluginTreeView: vi.fn(),
    isModuleOpen: () => false,
    ...stateOverrides,
  } as unknown as DockAppState
  render(
    <DockStateContext.Provider value={state}>
      <AgentSettingsModal visible session={session} fallbackName="oslo" onSave={vi.fn()} onClose={onClose} />
    </DockStateContext.Provider>,
  )
  return { state, onClose }
}

describe('AgentSettingsModal apps section', () => {
  beforeEach(() => { mockContributions.mockReturnValue([internalPanel, pluginPanel]) })

  it('lists the launcher apps for the active agent', () => {
    renderModal({})
    expect(screen.getByRole('button', { name: 'Open Demo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Statistics' })).toBeInTheDocument()
  })

  it('opens a plugin app and closes the modal', () => {
    const { state, onClose } = renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Open Statistics' }))
    expect(state.onOpenPluginView).toHaveBeenCalledWith('manifold.statistics.panel', 'Statistics')
    expect(onClose).toHaveBeenCalled()
  })

  it('opens an internal module via onOpenModule', () => {
    const { state } = renderModal({})
    fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }))
    expect(state.onOpenModule).toHaveBeenCalledWith('demo')
  })

  it('hides the apps section when this agent is not the active session', () => {
    renderModal({ sessionId: 'other' })
    expect(screen.queryByRole('button', { name: 'Open Demo' })).not.toBeInTheDocument()
  })

  it('hides the apps section when there are no launcher contributions', () => {
    mockContributions.mockReturnValue([])
    renderModal({})
    expect(screen.queryByText('Apps')).not.toBeInTheDocument()
  })
})

describe('AgentSettingsModal Viola runtime', () => {
  it('shows Viola as the agent and keeps its native runtime on save', async () => {
    mockContributions.mockReturnValue([])
    const onSave = vi.fn()
    const violaSession = { ...session, runtimeId: 'viola', nonInteractive: true, displayName: 'Viola' }
    render(
      <DockStateContext.Provider value={{ sessionId: 's1' } as unknown as DockAppState}>
        <AgentSettingsModal visible session={violaSession} fallbackName="Viola" onSave={onSave} onClose={vi.fn()} />
      </DockStateContext.Provider>,
    )

    expect(screen.getByLabelText('Agent runtime')).toHaveValue('viola')
    expect(screen.queryByText('View')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      displayName: 'Viola',
      runtimeId: 'viola',
      viewMode: 'chat',
    }))
  })
})
