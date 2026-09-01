import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const ONE_FOLDER = [{ projectId: 'p1', name: 'storefront', path: '/repos/storefront' }]
const THREE_FOLDERS = [
  ...ONE_FOLDER,
  { projectId: 'p2', name: 'payments', path: '/worktrees/checkout/payments' },
  { projectId: 'p3', name: 'docs', path: '/repos/docs' },
]

function makeControls(over: Partial<ShellHeaderControls> = {}): ShellHeaderControls {
  return {
    canAddShell: true,
    folders: ONE_FOLDER,
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
    expect(controls.onAddShell).toHaveBeenCalledWith('manifold', '/repos/storefront')
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
    expect(controls.onAddShell).toHaveBeenCalledWith('system', '/repos/storefront')

    fireEvent.click(chevron)
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Manifold Shell' }))
    expect(controls.onAddShell).toHaveBeenCalledWith('manifold', '/repos/storefront')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  // VS Code's rule verbatim: "Only choose a path when there's more than 1
  // folder" (terminalActions.ts:104).
  it('asks which folder when the workspace spans more than one', () => {
    const controls = makeControls({ folders: THREE_FOLDERS })
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Terminal' }))
    expect(controls.onAddShell).not.toHaveBeenCalled()

    const menu = screen.getByRole('menu', { name: /select current working directory/i })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'storefrontrepos/storefront',
      'paymentsworktrees/checkout/payments',
      'docsrepos/docs',
    ])

    fireEvent.click(within(menu).getByRole('menuitem', { name: /payments/ }))
    expect(controls.onAddShell).toHaveBeenCalledWith('manifold', '/worktrees/checkout/payments')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  it('carries the chosen shell type through the folder step', () => {
    const controls = makeControls({ folders: THREE_FOLDERS })
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Shell options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New System Shell' }))
    const menu = screen.getByRole('menu', { name: /select current working directory/i })
    fireEvent.click(within(menu).getByRole('menuitem', { name: /docs/ }))

    expect(controls.onAddShell).toHaveBeenCalledWith('system', '/repos/docs')

    unmount()
    unregisterShellHeaderControls(controls)
  })

  // A cancelled pick creates nothing, as in VS Code ("Don't create the instance
  // if the workspace picker was canceled").
  it('opens no terminal when the folder menu is dismissed', () => {
    const controls = makeControls({ folders: THREE_FOLDERS })
    registerShellHeaderControls(controls)

    const { unmount } = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Terminal' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: /select current working directory/i })).toBeNull()
    expect(controls.onAddShell).not.toHaveBeenCalled()

    unmount()
    unregisterShellHeaderControls(controls)
  })

  // The deliberate skip, mirroring VS Code's `terminal.newInActiveWorkspace`.
  it('offers a skip-the-picker item for the primary folder, only when there is a choice', () => {
    const many = makeControls({ folders: THREE_FOLDERS })
    registerShellHeaderControls(many)
    const first = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Shell options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Terminal in storefront' }))
    expect(many.onAddShell).toHaveBeenCalledWith('manifold', '/repos/storefront')
    expect(screen.queryByRole('menu', { name: /select current working directory/i })).toBeNull()

    first.unmount()
    unregisterShellHeaderControls(many)

    const one = makeControls()
    registerShellHeaderControls(one)
    const second = render(<ShellHeaderActions {...makeHeaderProps('shell')} />)
    fireEvent.click(screen.getByRole('button', { name: 'Shell options' }))
    expect(screen.queryByRole('menuitem', { name: /New Terminal in/ })).toBeNull()

    second.unmount()
    unregisterShellHeaderControls(one)
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
