import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DockTab } from './DockTab'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import type { DockAppState } from './components/editor/editor-shell/dock-panel-types'
import { makeDockState, makeHeaderProps } from './DockTab.test-helpers'
import { siblingPanelId } from './hooks/agent-session/agent-siblings'
import { AgentTabNameInput } from './AgentTabNameInput'
import type { AgentSession } from '../shared/types'

const session: AgentSession = {
  id: 'child-1', projectId: 'p1', runtimeId: 'codex', branchName: 'manifold/test',
  worktreePath: '/wt', status: 'running', pid: 1, additionalDirs: [], workspaceId: 'ws-1',
}

function renderTab(overrides: Partial<DockAppState> = {}, agent: AgentSession = session, title = 'Codex 2') {
  const onRenameAgent = vi.fn().mockResolvedValue(undefined)
  const onToggleMaximize = vi.fn()
  render(
    <DockStateContext.Provider value={makeDockState({
      onRenameAgent,
      onToggleMaximize,
      projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
      allProjectSessions: { p1: [agent] },
      ...overrides,
    } as unknown as Partial<DockAppState>)}>
      <DockTab {...makeHeaderProps(siblingPanelId(agent.id), title)} />
    </DockStateContext.Provider>,
  )
  return { onRenameAgent, onToggleMaximize }
}

function startRename(title = 'Codex 2'): HTMLInputElement {
  fireEvent.click(screen.getByLabelText(`Actions for ${title}`))
  fireEvent.click(screen.getByText('Rename'))
  return screen.getByLabelText('Agent name') as HTMLInputElement
}

describe('DockTab rename', () => {
  it('offers Rename as a top-level menu item, ahead of Agent settings…', () => {
    renderTab()

    fireEvent.click(screen.getByLabelText('Actions for Codex 2'))

    const labels = Array.from(document.querySelectorAll('.context-menu-item')).map((el) => el.textContent)
    expect(labels.indexOf('Rename')).toBe(0)
    expect(labels).toContain('Agent settings…')
  })

  it('turns the label into a focused input holding the current title', () => {
    renderTab()

    const input = startRename()

    expect(input.value).toBe('Codex 2')
    expect(input).toHaveFocus()
    expect(screen.queryByText('Codex 2')).toBeNull()
  })

  it('saves on Enter as a name-only update, so the agent is not restarted', () => {
    const { onRenameAgent } = renderTab()
    const input = startRename()

    fireEvent.change(input, { target: { value: '  Fix login  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameAgent).toHaveBeenCalledTimes(1)
    expect(onRenameAgent).toHaveBeenCalledWith('child-1', { displayName: 'Fix login', runtimeId: 'codex', viewMode: 'terminal' })
    expect(screen.queryByLabelText('Agent name')).toBeNull()
  })

  it('keeps a chat agent in chat view when renaming it', () => {
    const { onRenameAgent } = renderTab({}, { ...session, nonInteractive: true })
    const input = startRename()

    fireEvent.change(input, { target: { value: 'Chatty' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameAgent).toHaveBeenCalledWith('child-1', { displayName: 'Chatty', runtimeId: 'codex', viewMode: 'chat' })
  })

  it('saves on blur', () => {
    const { onRenameAgent } = renderTab()
    const input = startRename()

    fireEvent.change(input, { target: { value: 'Review' } })
    fireEvent.blur(input)

    expect(onRenameAgent).toHaveBeenCalledWith('child-1', expect.objectContaining({ displayName: 'Review' }))
  })

  it('cancels on Escape, and the blur that follows does not save the discarded draft', () => {
    const { onRenameAgent } = renderTab()
    const input = startRename()

    fireEvent.change(input, { target: { value: 'Thrown away' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(onRenameAgent).not.toHaveBeenCalled()
    expect(screen.getByText('Codex 2')).toBeInTheDocument()
  })

  it('does not save an empty or unchanged name', () => {
    const { onRenameAgent } = renderTab()
    let input = startRename()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    input = startRename()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onRenameAgent).not.toHaveBeenCalled()
  })

  it('leaves double-click on the tab as maximize, but not while typing in the field', () => {
    const { onToggleMaximize } = renderTab()
    fireEvent.doubleClick(screen.getByText('Codex 2'))
    expect(onToggleMaximize).toHaveBeenCalledTimes(1)

    const input = startRename()
    fireEvent.doubleClick(input)

    expect(onToggleMaximize).toHaveBeenCalledTimes(1)
  })
})

describe('AgentTabNameInput under StrictMode', () => {
  it('still focuses, edits and commits exactly once after the dev double-mount', () => {
    const onCommit = vi.fn()
    const onDone = vi.fn()
    render(
      <React.StrictMode>
        <AgentTabNameInput initial="Codex" onCommit={onCommit} onDone={onDone} />
      </React.StrictMode>,
    )
    const input = screen.getByLabelText('Agent name')

    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'Codex 7' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Codex 7')
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
