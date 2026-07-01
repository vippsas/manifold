import React, { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../../shared/workspace-types'
import { sidebarStyles } from './ProjectSidebar.styles'
import { FilesGlyph } from './FilesGlyph'
import { SourceControlGlyph } from './SourceControlGlyph'
import { SearchGlyph } from '../search/search-glyphs'
import { DockFileTree } from '../editor/file-tree/DockFileTree'
import { SourceControl } from '../git/SourceControl'
import { SearchView } from '../search/SearchView'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'

type SidebarView = 'explorer' | 'search' | 'sourceControl'

interface ProjectSidebarProps {
  /** Open a native folder picker and add the chosen folder (VS Code "Open Folder"). */
  onOpenFolder?: () => void
  workspaces?: Workspace[]
  activeWorkspaceId?: string | null
  /** Which activity view to show first. Defaults to the VS Code-style file Explorer. */
  initialView?: SidebarView
}

/**
 * The left sidebar: a VS Code-style activity bar switching between the file
 * **Explorer** and the git **Source Control** view. Repositories, sessions and
 * workspaces moved to the title-bar repository switcher (`RepositoriesPanel`).
 */
export function ProjectSidebar({
  onOpenFolder,
  workspaces,
  activeWorkspaceId,
  initialView = 'explorer',
}: ProjectSidebarProps): React.JSX.Element {
  const [view, setView] = useState<SidebarView>(initialView)
  const dockState = useContext(DockStateContext)

  // Cmd+Shift+F (and the Memory panel's "Open Search") bumps the focus key —
  // switch to the Search tab so the request lands on the now-visible input.
  const focusKey = dockState?.searchFocusRequestKey ?? 0
  const handledFocusKeyRef = useRef(focusKey)
  useEffect(() => {
    if (focusKey <= handledFocusKeyRef.current) return
    handledFocusKeyRef.current = focusKey
    setView('search')
  }, [focusKey])

  const activeWorkspace = activeWorkspaceId
    ? workspaces?.find((w) => w.id === activeWorkspaceId)
    : undefined

  // The "+" opens a native folder picker (VS Code "Open Folder" / "Add Folder to
  // Workspace") — the host wires the active-workspace nuance.
  const handleAddFolder = useCallback((): void => {
    onOpenFolder?.()
  }, [onOpenFolder])

  return (
    <div style={sidebarStyles.root}>
      <div style={sidebarStyles.activityBar}>
        <div style={sidebarStyles.activityIcons}>
          <button
            type="button"
            aria-label="Explorer"
            aria-current={view === 'explorer' ? 'page' : undefined}
            aria-pressed={view === 'explorer'}
            title="Explorer"
            onClick={() => setView('explorer')}
            className={`sidebar-activity-icon${view === 'explorer' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <FilesGlyph />
          </button>
          <button
            type="button"
            aria-label="Search"
            aria-current={view === 'search' ? 'page' : undefined}
            aria-pressed={view === 'search'}
            title="Search"
            onClick={() => setView('search')}
            className={`sidebar-activity-icon${view === 'search' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <SearchGlyph size={16} />
          </button>
          <button
            type="button"
            aria-label="Source Control"
            aria-current={view === 'sourceControl' ? 'page' : undefined}
            aria-pressed={view === 'sourceControl'}
            title="Source Control"
            onClick={() => setView('sourceControl')}
            className={`sidebar-activity-icon${view === 'sourceControl' ? ' sidebar-activity-icon--active' : ''}`}
            style={sidebarStyles.activityIcon}
          >
            <SourceControlGlyph />
          </button>
          {/* Future activity icons (search, …) go here. */}
        </div>
        <button
          type="button"
          onClick={handleAddFolder}
          aria-label={activeWorkspace ? 'Add folder to workspace' : 'Open folder'}
          title={activeWorkspace ? `Add Folder to ${activeWorkspace.name}` : 'Open Folder'}
          className="sidebar-activity-icon"
          style={sidebarStyles.activityIcon}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {view === 'explorer' ? (
        <div style={sidebarStyles.explorer}>
          {dockState ? (
            <DockFileTree />
          ) : (
            <div style={sidebarStyles.empty}>No folder open</div>
          )}
        </div>
      ) : view === 'search' ? (
        <div style={sidebarStyles.explorer}>
          {dockState ? (
            <SearchView />
          ) : (
            <div style={sidebarStyles.empty}>No folder open</div>
          )}
        </div>
      ) : (
        <div style={sidebarStyles.explorer}>
          {dockState ? (
            <SourceControl />
          ) : (
            <div style={sidebarStyles.empty}>No active repository</div>
          )}
        </div>
      )}
    </div>
  )
}
