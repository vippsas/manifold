import React from 'react'
import { createPortal } from 'react-dom'
import type { IDockviewHeaderActionsProps } from 'dockview'
import { DockStateContext } from './dock-panel-types'
import { AgentQuickAddMenu } from './AgentQuickAddMenu'
import { isSiblingPanelId, parseSiblingSessionId } from '../../../hooks/agent-session/agent-siblings'
import { shellTabStyles as styles } from '../../terminal/ShellTabs.styles'

function isAgentPanelId(id: string): boolean {
  return id === 'agent' || isSiblingPanelId(id)
}

// Dockview wraps a header-actions component in a block-level `.dv-react-part`,
// so a 24px pill would sit at the top of the 30px tab strip. Filling the
// wrapper's height and centring puts these controls on the tab labels' line.
const headerActions: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
  minWidth: 0,
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 4.75L6 7.75L9 4.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The split + at the start of the agent group's tab bar (the left header slot).
 *  Agents are the tabs of this group, so this is where a new one is added. The +
 *  starts an agent of the default type at once; the caret beside it lists the
 *  runtimes to pick from, with "More…" handing over to the full New Agent dialog
 *  (which the command, the shortcut and the empty view still open directly).
 *  Hiding a tab lives at the far right (`AgentCloseHeaderActions`); per-agent
 *  settings and delete live on each tab itself (see DockTab). */
export function AgentHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const [menuAnchor, setMenuAnchor] = React.useState<{ top: number; left: number } | null>(null)
  const caretRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuOpen = menuAnchor !== null

  React.useEffect(() => {
    if (!menuOpen) return
    const close = (): void => setMenuAnchor(null)
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (caretRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      close()
      caretRef.current?.focus()
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  // The workspace the new agent joins: the focused one, or whichever holds the
  // active repo (a repo is always in at least its home workspace). Which folder
  // is selected doesn't matter — the workspace decides where its agents run.
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    ?? state.workspaces.find((w) => w.projectIds.includes(state.activeProjectId ?? ''))

  if (!workspace) return null

  const openMenu = (): void => {
    const rect = caretRef.current?.getBoundingClientRect()
    if (rect) setMenuAnchor({ top: rect.bottom + 4, left: rect.left })
  }

  return (
    <div style={headerActions}>
      <div style={{ display: 'flex', alignItems: 'center' }} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          style={styles.headerAddButton}
          className="agent-header-add-button"
          onClick={() => { void state.onQuickAddAgent(workspace.id) }}
          title={`New agent in ${workspace.name}`}
          aria-label={`New agent in ${workspace.name}`}
        >
          +
        </button>
        <button
          ref={caretRef}
          type="button"
          style={styles.headerAddChevron}
          className="agent-header-add-button"
          onClick={() => (menuOpen ? setMenuAnchor(null) : openMenu())}
          title="Choose an agent"
          aria-label="Choose an agent"
          aria-haspopup="true"
          aria-expanded={menuOpen}
        >
          <ChevronIcon />
        </button>
        {menuAnchor && createPortal(
          <AgentQuickAddMenu
            ref={menuRef}
            anchor={menuAnchor}
            leadRuntimeId={workspace.runtimeId ?? state.defaultRuntime}
            onPick={(runtimeId, mode) => {
              setMenuAnchor(null)
              void state.onQuickAddAgent(workspace.id, { runtimeId, mode })
            }}
            onMore={() => {
              setMenuAnchor(null)
              state.onNewAgentFromHeader(workspace.id)
            }}
          />,
          document.body,
        )}
      </div>
    </div>
  )
}

/** The hide-× at the far right of the agent group's tab bar (the right header
 *  slot, so it lands at the top-right of the view like the shell's ×). It hides
 *  the active *sibling* tab — the agent stays alive, so selecting it again from
 *  the sidebar reopens the tab. Disabled while the structural primary `agent`
 *  tab is active, which is the workspace's persistent surface and cannot be
 *  hidden. */
export function AgentCloseHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  const activePanelId = props.activePanel?.id ?? null
  const activeSiblingSessionId = activePanelId && isSiblingPanelId(activePanelId)
    ? parseSiblingSessionId(activePanelId)
    : null

  return (
    <div style={headerActions}>
      <button
        type="button"
        style={styles.headerCloseButton}
        className="shell-header-close-button"
        onClick={(event) => {
          event.stopPropagation()
          if (activeSiblingSessionId) state.onCloseSiblingPanel(activeSiblingSessionId)
        }}
        disabled={!activeSiblingSessionId}
        title="Hide agent tab"
        aria-label="Hide agent tab"
      >
        ×
      </button>
    </div>
  )
}
