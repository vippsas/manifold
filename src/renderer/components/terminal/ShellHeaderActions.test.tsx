import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { ShellHeaderControls } from './shell-header-controls'
import { registerShellHeaderControls, unregisterShellHeaderControls } from './shell-header-controls'
import { ShellHeaderActions } from './ShellHeaderActions'

function makeHeaderProps(activePanelId: string): IDockviewHeaderActionsProps {
  return {
    api: {} as IDockviewHeaderActionsProps['api'],
    containerApi: {} as IDockviewHeaderActionsProps['containerApi'],
    panels: [],
    activePanel: { id: activePanelId } as IDockviewHeaderActionsProps['activePanel'],
    isGroupActive: true,
    group: {} as IDockviewHeaderActionsProps['group'],
    headerPosition: 'top',
  }
}

describe('ShellHeaderActions', () => {
  it('renders the new shell button as its own left-side header action', () => {
    const onAddShell = vi.fn()
    const onSetActiveTab = vi.fn()
    const controls: ShellHeaderControls = {
      effectiveTab: 'worktree',
      worktreeSessionId: 'shell-1',
      extraShells: [{ sessionId: 'shell-3', label: 'Shell 3' }],
      onSetActiveTab,
      onRemoveShell: vi.fn(),
      onAddShell,
    }
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    const addButton = screen.getByRole('button', { name: 'New shell tab' })
    const worktreeTab = screen.getByRole('button', { name: 'Worktree' })
    const extraTab = screen.getByRole('button', { name: /Shell 3/ })
    expect(addButton.compareDocumentPosition(worktreeTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(worktreeTab.compareDocumentPosition(extraTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(addButton)
    expect(onAddShell).toHaveBeenCalledTimes(1)

    fireEvent.click(extraTab)
    expect(onSetActiveTab).toHaveBeenCalledWith('extra-shell-3')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('does not render for non-shell panels', () => {
    const controls: ShellHeaderControls = {
      effectiveTab: 'worktree',
      worktreeSessionId: 'shell-1',
      extraShells: [],
      onSetActiveTab: vi.fn(),
      onRemoveShell: vi.fn(),
      onAddShell: vi.fn(),
    }
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('editor')} />)

    expect(screen.queryByRole('button', { name: 'New shell tab' })).toBeNull()

    unmount()
    unregisterShellHeaderControls(controls)
  })
})
