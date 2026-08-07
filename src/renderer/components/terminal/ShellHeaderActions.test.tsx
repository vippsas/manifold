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

function makeControls(over: Partial<ShellHeaderControls> = {}): ShellHeaderControls {
  return {
    canAddShell: true,
    onAddShell: vi.fn(),
    onHideTerminals: vi.fn(),
    ...over,
  }
}

describe('ShellHeaderActions', () => {
  it('opens a Manifold shell straight from + without showing the menu', () => {
    const controls = makeControls()
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Terminal' }))
    expect(controls.onAddShell).toHaveBeenCalledWith('manifold')
    expect(screen.queryByRole('menu')).toBeNull()

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('offers both shell types behind the chevron', () => {
    const controls = makeControls()
    registerShellHeaderControls(controls)

    const { container, unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    const chevron = screen.getByRole('button', { name: 'Shell options' })
    fireEvent.click(chevron)
    const menu = screen.getByRole('menu')
    expect(container.contains(menu)).toBe(false)
    expect(menu).toHaveStyle({ position: 'fixed' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'New System Shell' }))
    expect(controls.onAddShell).toHaveBeenCalledWith('system')

    fireEvent.click(chevron)
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Manifold Shell' }))
    expect(controls.onAddShell).toHaveBeenCalledWith('manifold')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('hides the whole terminal view from the header close button', () => {
    const controls = makeControls()
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Hide Terminals' }))
    expect(controls.onHideTerminals).toHaveBeenCalledTimes(1)

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('leaves the terminal list to the panel body', () => {
    const controls = makeControls()
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    expect(screen.queryByLabelText('Terminals')).toBeNull()

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('stays visible but disabled when no workspace resolves', () => {
    const controls = makeControls({ canAddShell: false })
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    expect(screen.getByRole('button', { name: 'New Terminal' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Shell options' })).toBeDisabled()

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('does not render for non-shell panels', () => {
    const controls = makeControls()
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('editor')} />)

    expect(screen.queryByRole('button', { name: 'New Terminal' })).toBeNull()

    unmount()
    unregisterShellHeaderControls(controls)
  })
})
