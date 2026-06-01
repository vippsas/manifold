import React from 'react'
import { ActionMenuButton, type ActionMenuButtonItem } from './ActionMenuButton'
import { DockStateContext } from './dock-panel-types'
import { PANEL_TITLES } from '../../hooks/dock-layout-helpers'
import { LAUNCHER_MODULES } from '../../modules/launcher-modules'

function PlusIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 2.2V9.8M2.2 6H9.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ModuleLauncher(): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  if (!state) return null

  const items: ActionMenuButtonItem[] = LAUNCHER_MODULES.map((mod) => {
    const open = state.isModuleOpen(mod.id)
    return {
      id: mod.id,
      label: `${open ? '✓ ' : ''}${PANEL_TITLES[mod.id]}`,
      description: mod.description,
      action: () => state.onOpenModule(mod.id),
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
