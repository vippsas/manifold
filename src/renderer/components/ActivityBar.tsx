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

const PANEL_GLYPHS: Record<DockPanelId, React.JSX.Element> = {
  projects: glyph(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />),
  agent: glyph(
    <>
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <path d="M12 9V6" />
      <circle cx="12" cy="4.5" r="1.2" />
      <path d="M9.5 13.5v1.5M14.5 13.5v1.5" />
    </>,
  ),
  editor: glyph(<path d="m9 8-4 4 4 4M15 8l4 4-4 4" />),
  fileTree: glyph(
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </>,
  ),
  modifiedFiles: glyph(<path d="M12 4v6M9 7h6M9 17h6" />),
  shell: glyph(<path d="m5 7 5 5-5 5M12 17h7" />),
}

/** Panels that only make sense while an agent session is active — mirrors the
 *  status bar, which offers its panel toggles only for a live session. */
const SESSION_PANELS: ReadonlySet<DockPanelId> = new Set(['editor', 'fileTree', 'modifiedFiles', 'shell'])

const RAIL_ORDER: DockPanelId[] = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell']

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
  onOpenSettings?: () => void
}

export function ActivityBar({ dockLayout, hasActiveSession, onOpenSettings }: ActivityBarProps): React.JSX.Element {
  return (
    <nav className="activity-bar" aria-label="Panels" style={activityBarStyles.root}>
      {RAIL_ORDER.map((id) => {
        const label = PANEL_TITLES[id]
        const active = dockLayout.isPanelVisible(id)
        const disabled = SESSION_PANELS.has(id) && !hasActiveSession
        return (
          <button
            key={id}
            type="button"
            className={`activity-bar-item${active ? ' activity-bar-item--active' : ''}`}
            onClick={() => dockLayout.togglePanel(id)}
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
          >
            {PANEL_GLYPHS[id]}
            <span className="activity-bar-tooltip" role="presentation">
              {label}
            </span>
          </button>
        )
      })}
      {onOpenSettings && (
        <>
          <span style={activityBarStyles.spacer} aria-hidden />
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
        </>
      )}
    </nav>
  )
}
