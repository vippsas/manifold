import React from 'react'
import type { DockPanelId } from '../hooks/dock-layout/useDockLayout'
import { PANEL_TITLES } from '../hooks/dock-layout/dock-layout-helpers'
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

const PANEL_GLYPH_PATHS: Record<DockPanelId, React.JSX.Element> = {
  projects: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
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
  modifiedFiles: <path d="M8 4.5v6M5 7.5h6M13 16.5h6" />,
  shell: <path d="m5 7 5 5-5 5M12 17h7" />,
}

/** Shared panel icon — the activity rail renders it at 18px; the icon-only
 *  Files / Modified Files dock tabs at a smaller size. */
export function PanelGlyph({ id, size = 18 }: { id: DockPanelId; size?: number }): React.JSX.Element {
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

interface RailItem {
  key: string
  label: string
  glyph: DockPanelId
  /** Panels this item stands for: it reads as open while any of them is, and
   *  clicking an open item closes all of them. */
  panels: DockPanelId[]
  /** Panels a click opens when the item is closed. */
  opens: DockPanelId[]
  /** Only meaningful while an agent session is active — mirrors the status bar,
   *  which offers its panel toggles only for a live session. */
  sessionOnly?: boolean
}

/** Modified Files and the editor are one dock item — a single card whose icon
 *  tabs switch between them — so the rail offers one toggle for both rather
 *  than two that could each be opened on their own. The file tree has no rail
 *  entry: it lives under its repo's row in Repositories. */
const FILES_ITEM_PANELS: DockPanelId[] = ['modifiedFiles', 'editor']

const RAIL_ITEMS: RailItem[] = [
  { key: 'projects', label: PANEL_TITLES.projects, glyph: 'projects', panels: ['projects'], opens: ['projects'] },
  { key: 'sourceControl', label: PANEL_TITLES.sourceControl, glyph: 'sourceControl', panels: ['sourceControl'], opens: ['sourceControl'] },
  { key: 'agent', label: PANEL_TITLES.agent, glyph: 'agent', panels: ['agent'], opens: ['agent'] },
  {
    key: 'files',
    label: PANEL_TITLES.editor,
    glyph: 'editor',
    panels: FILES_ITEM_PANELS,
    opens: FILES_ITEM_PANELS,
    sessionOnly: true,
  },
  { key: 'shell', label: PANEL_TITLES.shell, glyph: 'shell', panels: ['shell'], opens: ['shell'], sessionOnly: true },
]

const SEARCH_GLYPH = glyph(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m16.7 16.7 4.3 4.3" />
  </>,
)

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
  }
  hasActiveSession: boolean
  onOpenSearch?: () => void
  onOpenSettings?: () => void
}

export function ActivityBar({ dockLayout, hasActiveSession, onOpenSearch, onOpenSettings }: ActivityBarProps): React.JSX.Element {
  return (
    <nav className="activity-bar" aria-label="Panels" style={activityBarStyles.root}>
      {RAIL_ITEMS.map((item) => {
        const openPanels = item.panels.filter((id) => dockLayout.isPanelVisible(id))
        const active = openPanels.length > 0
        const disabled = item.sessionOnly === true && !hasActiveSession
        return (
          <button
            key={item.key}
            type="button"
            className={`activity-bar-item${active ? ' activity-bar-item--active' : ''}`}
            onClick={() => {
              for (const id of active ? openPanels : item.opens) dockLayout.togglePanel(id)
            }}
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
      {(onOpenSearch || onOpenSettings) && <span style={activityBarStyles.spacer} aria-hidden />}
      {onOpenSearch && (
        <button
          type="button"
          className="activity-bar-item"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          {SEARCH_GLYPH}
          <span className="activity-bar-tooltip" role="presentation">
            Search
          </span>
        </button>
      )}
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
