import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { DockStateContext } from './components/editor/editor-shell/dock-panel-types'
import { isSiblingPanelId, parseSiblingSessionId } from './hooks/agent-session/agent-siblings'
import { isEditorPanelId } from './hooks/dock-layout/dock-layout-helpers'
import { formatBranchLabel } from './components/sidebar/agent-labels'
import { AgentSettingsModal } from './components/modals/AgentSettingsModal'
import { PanelGlyph, type GlyphId } from './components/ActivityBar'
import { ContextMenu, type MenuItem } from './components/common/ContextMenu'
import { useContextMenu } from './hooks/useContextMenu'

function EllipsisIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="10" cy="6" r="1" />
    </svg>
  )
}

/** Panels whose tabs carry no close button of their own — a single × in the
 *  group header closes the whole item (see WorkspaceHeaderActions). The sidebar
 *  is here despite rendering no tab at all: the header × is the only way to
 *  close it. The editor is the exception that proves the rule — alone in its
 *  group it hides that header (dockview-theme.css) and its × rides the file-tab
 *  strip instead (EditorPaneActions); this tab shows only when it shares a
 *  group with another panel. */
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
  const menu = useContextMenu()
  React.useEffect(() => {
    setTitle(api.title ?? '')
    const disposable = api.onDidTitleChange(() => setTitle(api.title ?? ''))
    return () => disposable.dispose()
  }, [api])
  if (HEADLESS_TAB_PANELS.has(api.id)) {
    return <div className="dock-tab dock-tab--headless" aria-label={title} />
  }
  // An editor pane carries a tab strip of its own — the code viewer's file tabs —
  // so a group holding nothing but one editor hides this header entirely (see
  // dockview-theme.css). The marker is what that rule matches on, and it goes on
  // both editor tab shapes: the icon tab the first pane renders and the text tab
  // a split pane (`editor:N`) falls through to below.
  const editorClass = isEditorPanelId(api.id) ? ' dock-tab--editor' : ''
  if (ICON_TAB_PANELS.has(api.id)) {
    return (
      <div
        className={`dock-tab dock-tab--icon${editorClass}`}
        title={title}
        aria-label={title}
        onDoubleClick={() => state?.onToggleMaximize(api.id)}
      >
        <PanelGlyph id={api.id as GlyphId} size={18} />
      </div>
    )
  }
  // An agent tab *is* its agent. Its worded overflow menu opens settings,
  // protects it from deletion, or deletes it (behind the confirm) rather than
  // showing a row of ambiguous glyphs. Hiding the tab (keeping the agent) is the
  // group header's × (see AgentHeaderActions). The primary `agent` tab resolves
  // to the workspace's primary session; siblings carry their own session id.
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
    const menuItems: MenuItem[] = session && state ? [
      { label: 'Agent settings…', action: () => setSettingsOpen(true) },
      {
        label: session.locked ? 'Unlock agent' : 'Lock agent',
        action: () => state.onToggleLocked(session.id, !session.locked),
      },
      'separator',
      {
        label: 'Delete agent',
        action: () => state.onRequestDeleteAgent(session, projectPath),
        disabled: !!session.locked,
      },
    ] : []
    return (
      <div className="dock-tab" onDoubleClick={() => state?.onToggleMaximize(api.id)}>
        <span className="dock-tab__label truncate">{title}</span>
        {session && state && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                menu.openAt({ x: rect.left, y: rect.bottom + 4 })
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              className="dock-tab__action"
              title={`Actions for ${title}`}
              aria-label={`Actions for ${title}`}
              aria-haspopup="menu"
              aria-expanded={menu.position !== null}
            >
              <EllipsisIcon />
            </button>
            {menu.position && (
              <ContextMenu
                x={menu.position.x}
                y={menu.position.y}
                items={menuItems}
                onClose={menu.close}
              />
            )}
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
      className={`dock-tab${editorClass}`}
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
