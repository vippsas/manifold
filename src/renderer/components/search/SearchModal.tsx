import React, { useRef } from 'react'
import type { AgentSession } from '../../../shared/types'
import type { SearchMode } from '../../../shared/search-types'
import { SearchView } from './SearchView'
import { searchModalStyles as styles } from './SearchModal.styles'

export interface SearchModalProps {
  visible: boolean
  onClose: () => void
  activeProjectId: string | null
  activeSessionId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
  /** Scope to preselect — the Memory panel's "Open Search" asks for Memory. */
  requestedMode?: SearchMode | null
}

/** Mounts the search UI only while open, so a closed modal costs no
 *  `search:context` IPC and each open starts from a clean query. */
export function SearchModal({
  visible,
  onClose,
  activeProjectId,
  activeSessionId,
  allProjectSessions,
  onOpenSearchResult,
  requestedMode,
}: SearchModalProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)
  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      style={styles.overlay}
      onMouseDown={(event) => { if (event.target === overlayRef.current) onClose() }}
      // Escape bubbles up from the query input.
      onKeyDown={(event) => { if (event.key === 'Escape') onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
      <div style={styles.panel}>
        <SearchView
          activeProjectId={activeProjectId}
          activeSessionId={activeSessionId}
          allProjectSessions={allProjectSessions}
          onOpenSearchResult={(target) => {
            onOpenSearchResult(target)
            onClose()
          }}
          requestedMode={requestedMode}
          autoFocus
        />
        <div style={styles.footer}>
          <span><span style={styles.fkbd}>↑↓</span>navigate</span>
          <span><span style={styles.fkbd}>⏎</span>open</span>
          <span><span style={styles.fkbd}>esc</span>close</span>
        </div>
      </div>
    </div>
  )
}
