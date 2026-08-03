import { useCallback, useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../../shared/workspace-types'

export interface UsePersistedActiveWorkspaceResult {
  activeWorkspaceId: string | null
  setActiveWorkspaceId: (id: string | null) => void
}

/**
 * The active workspace, remembered across restarts. Drop-in replacement for the
 * `useState<string | null>(null)` it grew out of: reads persist through
 * `workspace:get-active` once the workspace list is known, writes through on
 * every change.
 */
export function usePersistedActiveWorkspace(workspaces: Workspace[]): UsePersistedActiveWorkspaceResult {
  const [activeWorkspaceId, setActive] = useState<string | null>(null)
  const loadedRef = useRef(false)

  // Deferred until the list arrives: a persisted workspace may have been deleted
  // while the app was closed, and a dangling id must not be restored.
  useEffect(() => {
    if (loadedRef.current || workspaces.length === 0) return
    loadedRef.current = true
    void (async () => {
      try {
        const saved = await window.electronAPI.invoke('workspace:get-active')
        if (typeof saved === 'string' && workspaces.some((w) => w.id === saved)) {
          setActive(saved)
        }
      } catch (err) {
        console.error('[usePersistedActiveWorkspace] failed to load persisted workspace', err)
      }
    })()
  }, [workspaces])

  // Writing only here — never from a load effect — keeps the initial render from
  // erasing the saved id before it has been read back.
  const setActiveWorkspaceId = useCallback((id: string | null) => {
    setActive(id)
    void window.electronAPI.invoke('workspace:set-active', id)
  }, [])

  return { activeWorkspaceId, setActiveWorkspaceId }
}
