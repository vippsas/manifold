import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import { isSiblingPanelId, parseSiblingSessionId } from './hooks/agent-session/agent-siblings'
import { formatBranchLabel } from './components/sidebar/agent-labels'
import { AgentSettingsModal } from './components/modals/AgentSettingsModal'
import { PanelGlyph, type GlyphId } from './components/ActivityBar'

function GearIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/** Padlock marking a locked (deletion-protected) agent. `locked` swaps the closed
 *  shackle for an open one, so the button shows the state it is in rather than the
 *  action it performs — matching the ⚙/🗑 sizing beside it. */
function LockIcon({ locked }: { locked: boolean }): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.25 3.25H9.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M4.75 3.25V2.25H7.25V3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.25 3.25L3.75 9.5H8.25L8.75 3.25" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Panels whose tabs carry no close button of their own — a single × in the
 *  group header closes the whole item (see WorkspaceHeaderActions). The sidebar
 *  is here despite rendering no tab at all: the header × is the only way to
 *  close it. */
export const ICON_TAB_PANELS = new Set<string>(['sidebar', 'editor'])

/** The sidebar renders no tab at all: it is alone in its column, a lone tab
 *  switches nothing, and which view it shows is already said by the active icon
 *  in the activity rail. The group header keeps its ×. */
const HEADLESS_TAB_PANELS = new Set<string>(['sidebar'])

export function DockTab({ api }: IDockviewPanelHeaderProps): React.JSX.Element {
  const state = React.useContext(DockStateContext)
  // Subscribe to title changes so the tab re-renders on update even when the
  // DockStateContext is memoized (which otherwise stops the constant re-renders
  // that currently mask this).
  const [title, setTitle] = React.useState(api.title ?? '')
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  React.useEffect(() => {
    setTitle(api.title ?? '')
    const disposable = api.onDidTitleChange(() => setTitle(api.title ?? ''))
    return () => disposable.dispose()
  }, [api])
  if (HEADLESS_TAB_PANELS.has(api.id)) {
    return <div className="dock-tab dock-tab--headless" aria-label={title} />
  }
  if (ICON_TAB_PANELS.has(api.id)) {
    return (
      <div
        className="dock-tab dock-tab--icon"
        title={title}
        aria-label={title}
        onDoubleClick={() => state?.onToggleMaximize(api.id)}
      >
        <PanelGlyph id={api.id as GlyphId} size={18} />
      </div>
    )
  }
  // An agent tab *is* its agent. Its per-tab controls act on that agent — ⚙
  // opens settings, 🔒 protects it from deletion, 🗑 deletes it (behind the
  // confirm) — rather than the generic × that hides a panel. Hiding the tab
  // (keeping the agent) is the group header's × (see AgentHeaderActions). The
  // primary `agent` tab resolves to the workspace's primary session; siblings
  // carry their own session id.
  if (api.id === 'agent' || isSiblingPanelId(api.id)) {
    const sessionId = api.id === 'agent' ? state?.primarySessionId ?? null : parseSiblingSessionId(api.id)
    const session = sessionId && state
      ? Object.values(state.allProjectSessions).flat().find((s) => s.id === sessionId) ?? null
      : null
    const projectPath = session
      ? state?.projects.find((p) => p.id === session.projectId)?.path ?? ''
      : ''
    const fallbackName = session
      ? (session.displayName?.trim() || formatBranchLabel(session.branchName, projectPath))
      : ''
    return (
      <div className="dock-tab" onDoubleClick={() => state?.onToggleMaximize(api.id)}>
        <span className="dock-tab__label truncate">{title}</span>
        {session && state && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSettingsOpen(true) }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="dock-tab__action"
              title={`Settings for ${title}`}
              aria-label={`Settings for ${title}`}
            >
              <GearIcon />
            </button>
            {/* Sits immediately left of the 🗑 it guards, and stays visible while
                locked — the other actions are hover-only, but a lock is state,
                not an action, and has to read without hovering the tab. */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); state.onToggleLocked(session.id, !session.locked) }}
              onDoubleClick={(e) => e.stopPropagation()}
              className={`dock-tab__action${session.locked ? ' is-locked' : ''}`}
              aria-pressed={!!session.locked}
              title={session.locked ? 'Unlock agent' : 'Lock agent to prevent deletion'}
              aria-label={session.locked ? `Unlock ${title}` : `Lock ${title} to prevent deletion`}
            >
              <LockIcon locked={!!session.locked} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); state.onRequestDeleteAgent(session, projectPath) }}
              onDoubleClick={(e) => e.stopPropagation()}
              disabled={!!session.locked}
              className="dock-tab__action"
              title={session.locked ? `${title} is locked — unlock it to delete` : `Delete ${title}`}
              aria-label={`Delete ${title}`}
            >
              <TrashIcon />
            </button>
            <AgentSettingsModal
              visible={settingsOpen}
              session={session}
              fallbackName={fallbackName}
              onSave={(settings) => state.onRenameAgent(session.id, settings)}
              onClose={() => setSettingsOpen(false)}
            />
          </>
        )}
      </div>
    )
  }
  return (
    <div
      className="dock-tab"
      onDoubleClick={() => state?.onToggleMaximize(api.id)}
    >
      <span className="dock-tab__label truncate">{title}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); state?.onClosePanel(api.id) }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="dock-tab__close"
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
      height: '100%', color: 'var(--text-muted)', fontSize: 'inherit',
    }}>
      Drag a panel here
    </div>
  )
}
