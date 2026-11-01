import { useCallback, useEffect, useRef } from 'react'
import type { ResolvedFavorite } from '../../../shared/types'
import { resolveWorkspaceEntry, type WorkspaceEntryContext } from './workspace-entry'

interface Options extends WorkspaceEntryContext {
  activeWorkspaceId: string | null
  favorites: readonly ResolvedFavorite[]
  selectWorkspace: (id: string | null) => void
  selectSession: (id: string | null) => void
  setActiveProject: (id: string) => void
}

/** Workspace entry and tab selection share synchronous memory. Capturing on
 * selection (rather than project-effect cleanup) preserves a tab picked in
 * the same React batch as entering another workspace. */
export function useWorkspaceEntry({
  workspaces, sessionsByWorkspace, activeWorkspaceId, activeSessionId, activeProjectId,
  favorites, selectWorkspace, selectSession, setActiveProject,
}: Options) {
  const lastSessionByWorkspaceRef = useRef(new Map<string, string>())
  const workspaceRef = useRef(activeWorkspaceId)
  workspaceRef.current = activeWorkspaceId
  const sessionRef = useRef(activeSessionId)
  sessionRef.current = activeSessionId

  const setActiveWorkspaceId = useCallback((id: string | null): void => {
    workspaceRef.current = id
    selectWorkspace(id)
  }, [selectWorkspace])

  const setActiveSession = useCallback((id: string | null): void => {
    const workspaceId = workspaceRef.current
    const session = workspaceId ? sessionsByWorkspace[workspaceId]?.find((s) => s.id === id) : undefined
    if (workspaceId && session) lastSessionByWorkspaceRef.current.set(workspaceId, session.id)
    sessionRef.current = id
    selectSession(id)
    // Dock tabs may belong to another repo in the same workspace. Load that
    // repo's sessions too, just as entering a workspace through the sidebar does.
    if (session) setActiveProject(session.projectId)
  }, [sessionsByWorkspace, selectSession, setActiveProject])

  // Also capture selections made by session loading, spawning or deletion.
  // Membership guards against the departing agent during a workspace change;
  // the key is the selected workspace, never the first holder of a shared repo.
  useEffect(() => {
    if (activeWorkspaceId && activeSessionId
      && sessionsByWorkspace[activeWorkspaceId]?.some((s) => s.id === activeSessionId)) {
      lastSessionByWorkspaceRef.current.set(activeWorkspaceId, activeSessionId)
    }
  }, [activeWorkspaceId, activeSessionId, sessionsByWorkspace])

  const enterWorkspace = useCallback((id: string): void => {
    const entry = resolveWorkspaceEntry(id, {
      workspaces, sessionsByWorkspace, activeSessionId: sessionRef.current, activeProjectId,
      rememberedSessionId: lastSessionByWorkspaceRef.current.get(id),
    })
    setActiveWorkspaceId(id)
    if (entry.kind === 'keep') return
    if (entry.kind === 'agent') {
      setActiveSession(entry.session.id)
      return
    }
    if (entry.projectId) setActiveProject(entry.projectId)
    setActiveSession(null)
  }, [workspaces, sessionsByWorkspace, activeProjectId, setActiveWorkspaceId, setActiveSession, setActiveProject])

  const activateFavorite = useCallback((fav: ResolvedFavorite): void => enterWorkspace(fav.id), [enterWorkspace])
  const jumpToFavorite = useCallback((index: number): void => {
    const fav = favorites[index]
    if (fav) activateFavorite(fav)
  }, [favorites, activateFavorite])

  return { setActiveSession, setActiveWorkspaceId, enterWorkspace, activateFavorite, jumpToFavorite }
}
