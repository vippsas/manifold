import React from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useMemory } from '../../hooks/useMemory'
import { MemoryPanelContent } from './MemoryPanelContent'
import { memoryStyles as s } from './MemoryPanel.styles'

export function MemoryPanel(): React.JSX.Element {
  const { activeProjectId, onShowSearchPanel } = useDockState()
  const memory = useMemory(activeProjectId)

  if (!activeProjectId) {
    return (
      <div style={s.emptyState}>
        Select a project to view memory
      </div>
    )
  }

  return <MemoryPanelContent memory={memory} onOpenSearch={() => onShowSearchPanel('memory')} />
}
