import React from 'react'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import { useLauncherContributions } from '../../plugins/use-contributions'
import type { DockPanelId } from '../../hooks/dock-layout-helpers'

function PlusIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2.2V9.8M2.2 6H9.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ModuleLauncher(): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const contributions = useLauncherContributions()
  if (!state) return null

  const items: ActionMenuButtonItem[] = contributions.map((c) => {
    if (c.source === 'plugin') {
      const action = (c as { kind?: string }).kind === 'tree'
        ? () => state.onOpenPluginTreeView(c.id, c.title)
        : () => state.onOpenPluginView(c.id, c.title)
      return { id: c.id, label: c.title, description: c.description, action }
    }
    const open = state.isModuleOpen(c.id as DockPanelId)
    return {
      id: c.id,
      label: `${open ? '✓ ' : ''}${c.title}`,
      description: c.description,
      action: () => state.onOpenModule(c.id as DockPanelId),
    }
  })

  return (
    <ActionMenuButton
      buttonLabel={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <PlusIcon />
          Apps
        </span>
      }
      title="Open module"
      menuLabel="Modules"
      items={items}
    />
  )
}
