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
      activeTab: 'main',
      canAddShell: true,
      shellPrompt: true,
      extraShells: [{ sessionId: 'shell-2', label: 'Shell 2' }],
      onSetActiveTab,
      onRemoveShell: vi.fn(),
      onAddShell,
      onShellPromptChange: vi.fn(),
    }
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    const addButton = screen.getByRole('button', { name: 'New shell tab' })
    expect(screen.queryByRole('checkbox', { name: 'Use Manifold prompt in worktree shells' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Worktree' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Repository' })).toBeNull()
    expect(screen.queryByTitle('Switch to repository')).toBeNull()

    const mainTab = screen.getByRole('button', { name: 'Shell' })
    const extraTab = screen.getByRole('button', { name: /Shell 2/ })
    expect(addButton.compareDocumentPosition(mainTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(mainTab.compareDocumentPosition(extraTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.click(addButton)
    expect(onAddShell).toHaveBeenCalledTimes(1)

    fireEvent.click(extraTab)
    expect(onSetActiveTab).toHaveBeenCalledWith('extra-shell-2')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('does not render for non-shell panels', () => {
    const controls: ShellHeaderControls = {
      activeTab: 'main',
      canAddShell: true,
      shellPrompt: true,
      extraShells: [],
      onSetActiveTab: vi.fn(),
      onRemoveShell: vi.fn(),
      onAddShell: vi.fn(),
      onShellPromptChange: vi.fn(),
    }
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('editor')} />)

    expect(screen.queryByRole('button', { name: 'New shell tab' })).toBeNull()

    unmount()
    unregisterShellHeaderControls(controls)
  })
})
