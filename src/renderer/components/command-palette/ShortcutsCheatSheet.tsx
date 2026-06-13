import React, { useRef } from 'react'
import { createDialogStyles } from '../workbench-style-primitives'
import { ShortcutList } from './ShortcutList'

const styles = createDialogStyles('560px')

interface ShortcutsCheatSheetProps {
  visible: boolean
  onClose: () => void
}

/** Keyboard-shortcuts help overlay (Cmd+Shift+/). Lists the active bindings. */
export function ShortcutsCheatSheet({ visible, onClose }: ShortcutsCheatSheetProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)
  if (!visible) return null
  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      tabIndex={-1}
    >
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Keyboard Shortcuts</span>
          <button type="button" onClick={onClose} style={styles.closeButton} aria-label="Close keyboard shortcuts">&times;</button>
        </div>
        <div style={{ ...styles.body, maxHeight: '70vh', overflowY: 'auto' }}>
          <ShortcutList />
        </div>
      </div>
    </div>
  )
}
