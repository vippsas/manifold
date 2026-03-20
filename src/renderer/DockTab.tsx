import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/dock-panel-types'

export function DockTab({ api }: IDockviewPanelHeaderProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  const title = api.title ?? ''
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      <span>{title}</span>
      <button
        onClick={(e) => { e.stopPropagation(); state?.onClosePanel(api.id) }}
        style={{
          fontSize: '11px', lineHeight: 1, color: 'var(--text-muted)',
          padding: '0 2px', cursor: 'pointer', opacity: 0.6,
        }}
        title={`Close ${title}`}
      >
        &times;
      </button>
    </div>
  )
}

export function EmptyWatermark(): React.JSX.Element {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', color: 'var(--text-muted)', fontSize: '12px',
    }}>
      Drag a panel here
    </div>
  )
}
