import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDockState } from './editor/editor-shell/dock-panel-types'
import { RepositoriesPanel } from './sidebar/RepositoriesPanel'
import { repositorySwitcherStyles as styles } from './RepositorySwitcher.styles'

/**
 * Title-bar entry point for repositories, workspaces, sessions and drafts. A
 * compact switcher button opens a dropdown hosting the full `RepositoriesPanel`
 * (formerly the sidebar "Repositories" view). Reads DockStateContext and maps it
 * onto the panel's props, wrapping the navigation callbacks so a selection also
 * closes the dropdown — matching VS Code's workspace switcher feel.
 */
export function RepositorySwitcher(): React.JSX.Element {
  const s = useDockState()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = useCallback(() => setOpen(false), [])
  const afterSelect = useCallback(<A extends unknown[]>(fn: (...args: A) => void) => (...args: A): void => {
    fn(...args)
    close()
  }, [close])

  const activeWorkspace = s.activeWorkspaceId ? s.workspaces?.find((w) => w.id === s.activeWorkspaceId) : undefined
  const activeProject = s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined
  const label = activeWorkspace?.name ?? activeProject?.name ?? 'Repositories'
  const sublabel = s.sessionId ? s.primaryBranch ?? null : null

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch repository, workspace or session"
        style={styles.button}
        className="titlebar-repo-switcher"
      >
        <span aria-hidden style={styles.icon}>⧉</span>
        <span className="truncate" style={styles.label}>{label}</span>
        {sublabel && <span className="truncate" style={styles.sublabel}>{sublabel}</span>}
        <span aria-hidden style={styles.chevron}>▾</span>
      </button>
      {open && (
        <div style={styles.dropdown} role="menu" aria-label="Repositories">
          <RepositoriesPanel
            projects={s.projects}
            activeProjectId={s.activeProjectId}
            suppressedProjectIds={s.suppressedProjectIds}
            allProjectSessions={s.allProjectSessions}
            activeSessionId={s.sessionId}
            outputtingSessionIds={s.outputtingSessionIds}
            onSelectProject={afterSelect(s.onSelectProject)}
            onSelectSession={afterSelect(s.onSelectSession)}
            onRemoveProject={s.onRemoveProject}
            onUpdateProject={s.onUpdateProject}
            onRenameAgent={s.onRenameAgent}
            onRequestDeleteAgent={s.onRequestDeleteAgent}
            onNewAgent={afterSelect(s.onNewAgentFromHeader)}
            onNewProject={afterSelect(s.onNewProject)}
            onNewWorkspace={s.onNewWorkspace ? afterSelect(s.onNewWorkspace) : undefined}
            workspaces={s.workspaces}
            activeWorkspaceId={s.activeWorkspaceId}
            sessionsByWorkspace={s.sessionsByWorkspace}
            onSelectWorkspace={s.onSelectWorkspace ? afterSelect(s.onSelectWorkspace) : undefined}
            onRemoveWorkspace={s.onRemoveWorkspace}
            onSelectWorkspaceRepo={s.onSelectWorkspaceRepo ? afterSelect(s.onSelectWorkspaceRepo) : undefined}
            onAddProjectToWorkspace={s.onAddProjectToWorkspace}
            onRemoveProjectFromWorkspace={s.onRemoveProjectFromWorkspace}
            fetchingProjectId={s.fetchingProjectId}
            lastFetchedProjectId={s.lastFetchedProjectId}
            fetchResult={s.fetchResult}
            fetchError={s.fetchError}
            onFetchProject={s.onFetchProject}
            activeProjectBehindCount={s.activeProjectBehindCount}
            drafts={s.drafts}
            activeDraftId={s.activeDraft?.id ?? null}
            onSelectDraft={afterSelect((id: string) => s.onSelectSession(id, s.activeProjectId ?? ''))}
            onDiscardDraft={s.discardDraft}
          />
        </div>
      )}
    </div>
  )
}
