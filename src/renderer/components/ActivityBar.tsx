import React from 'react'
import type { DockPanelId } from '../hooks/dock-layout/useDockLayout'
import { PANEL_TITLES } from '../hooks/dock-layout/dock-layout-helpers'
import { SIDEBAR_VIEW_IDS, SIDEBAR_VIEW_TITLES, type SidebarViewId } from './sidebar/sidebar-views'
import { activityBarStyles } from './ActivityBar.styles'

function glyph(paths: React.ReactNode): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}

/** Icons are keyed by sidebar view as well as by dock panel: the rail's top
 *  group switches sidebar views, its lower group toggles main-area panels. */
export type GlyphId = SidebarViewId | 'agent' | 'editor' | 'shell'

const PANEL_GLYPH_PATHS: Record<GlyphId, React.JSX.Element> = {
  explorer: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.7 16.7 4.3 4.3" />
    </>
  ),
  sourceControl: (
    <>
      <path d="M6 9v6" />
      <circle cx="18" cy="6" r="2.4" />
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <path d="M18 8.4a9 9 0 0 1-9 9" />
    </>
  ),
  agent: (
    <>
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <path d="M12 9V6" />
      <circle cx="12" cy="4.5" r="1.2" />
      <path d="M9.5 13.5v1.5M14.5 13.5v1.5" />
    </>
  ),
  editor: <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />,
  shell: <path d="m5 7 5 5-5 5M12 17h7" />,
}

/** Shared icon — the activity rail renders it at 18px; the icon-only editor
 *  dock tab at a smaller size. */
export function PanelGlyph({ id, size = 18 }: { id: GlyphId; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PANEL_GLYPH_PATHS[id]}
    </svg>
  )
}

interface PanelRailItem {
  id: DockPanelId
  label: string
  glyph: GlyphId
  /** Only meaningful while an agent session is active — the editor opens files
   *  from the session's worktree, so it has nothing to show without one. */
  sessionOnly?: boolean
}

/** The main area's panels, which the rail toggles open and closed. The sidebar
 *  views are handled separately above: their icons switch what the one sidebar
 *  shows rather than opening a column each. The file tree has no entry of its
 *  own — it lives under its repo's row in the Explorer. */
const PANEL_RAIL_ITEMS: PanelRailItem[] = [
  { id: 'agent', label: PANEL_TITLES.agent, glyph: 'agent' },
  { id: 'editor', label: PANEL_TITLES.editor, glyph: 'editor', sessionOnly: true },
  { id: 'shell', label: PANEL_TITLES.shell, glyph: 'shell' },
]

const SETTINGS_GLYPH = glyph(
  <>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
)

export interface ActivityBarProps {
  dockLayout: {
    isPanelVisible: (id: DockPanelId) => boolean
    togglePanel: (id: DockPanelId) => void
    focusPanel: (id: string) => void
  }
  /** Which view the sidebar is showing — the rail marks that icon active. */
  sidebarView: SidebarViewId
  onSelectSidebarView: (id: SidebarViewId) => void
  hasActiveSession: boolean
  onOpenSettings?: () => void
}

export function ActivityBar({
  dockLayout,
  sidebarView,
  onSelectSidebarView,
  hasActiveSession,
  onOpenSettings,
}: ActivityBarProps): React.JSX.Element {
  const sidebarOpen = dockLayout.isPanelVisible('sidebar')

  // VS Code's rail behaviour: a different view swaps what the sidebar shows,
  // and clicking the view already showing collapses the sidebar — so the same
  // icon both reveals and hides, and the sidebar is never left showing a view
  // nobody asked for.
  const selectSidebarView = (id: SidebarViewId): void => {
    if (!sidebarOpen) {
      onSelectSidebarView(id)
      dockLayout.togglePanel('sidebar')
      return
    }
    if (sidebarView !== id) {
      onSelectSidebarView(id)
      dockLayout.focusPanel('sidebar')
      return
    }
    dockLayout.togglePanel('sidebar')
  }

  return (
    <nav className="activity-bar" aria-label="Views" style={activityBarStyles.root}>
      {SIDEBAR_VIEW_IDS.map((id) => {
        const active = sidebarOpen && sidebarView === id
        return (
          <button
            key={id}
            type="button"
            className={`activity-bar-item${active ? ' activity-bar-item--active' : ''}`}
            onClick={() => selectSidebarView(id)}
            aria-label={SIDEBAR_VIEW_TITLES[id]}
            aria-pressed={active}
          >
            <PanelGlyph id={id} />
            <span className="activity-bar-tooltip" role="presentation">
              {SIDEBAR_VIEW_TITLES[id]}
            </span>
          </button>
        )
      })}
      <span style={activityBarStyles.divider} aria-hidden />
      {PANEL_RAIL_ITEMS.map((item) => {
        const active = dockLayout.isPanelVisible(item.id)
        const disabled = item.sessionOnly === true && !hasActiveSession
        return (
          <button
            key={item.id}
            type="button"
            className={`activity-bar-item${active ? ' activity-bar-item--active' : ''}`}
            onClick={() => dockLayout.togglePanel(item.id)}
            disabled={disabled}
            aria-label={item.label}
            aria-pressed={active}
          >
            <PanelGlyph id={item.glyph} />
            <span className="activity-bar-tooltip" role="presentation">
              {item.label}
            </span>
          </button>
        )
      })}
      {onOpenSettings && <span style={activityBarStyles.spacer} aria-hidden />}
      {onOpenSettings && (
        <button
          type="button"
          className="activity-bar-item"
          onClick={onOpenSettings}
          aria-label="Settings"
        >
          {SETTINGS_GLYPH}
          <span className="activity-bar-tooltip" role="presentation">
            Settings
          </span>
        </button>
      )}
    </nav>
  )
}
