import React from 'react'
import { createPortal } from 'react-dom'
import type { IDockviewHeaderActionsProps } from 'dockview'
import type { AgentRuntime, AgentSession } from '../../../../shared/types'
import { DockStateContext } from './dock-panel-types'
import { isSiblingPanelId } from '../../../hooks/agent-session/agent-siblings'
import { formatBranchLabel, runtimeLabel } from '../../sidebar/agent-labels'
import { AgentSettingsModal } from '../../modals/AgentSettingsModal'
import { shellTabStyles as styles } from '../../terminal/ShellTabs.styles'

function isAgentPanelId(id: string): boolean {
  return id === 'agent' || isSiblingPanelId(id)
}

/** The + (and settings gear) in the agent group's tab bar. Agents are the tabs
 *  of this group, so this is where a new one is added: pick a runtime and
 *  Terminal/Chat, and it spawns straight into the active workspace's checkout,
 *  appearing as a sibling tab. Mirrors the shell group's + button. */
export function AgentHeaderActions(props: IDockviewHeaderActionsProps): React.JSX.Element | null {
  const state = React.useContext(DockStateContext)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number } | null>(null)
  const [runtimes, setRuntimes] = React.useState<AgentRuntime[]>([])
  const [settingsVisible, setSettingsVisible] = React.useState(false)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  const updateMenuPosition = React.useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPosition({ top: rect.bottom, left: rect.left })
  }, [])

  React.useLayoutEffect(() => {
    if (!menuOpen) return
    updateMenuPosition()
    void window.electronAPI.invoke('runtimes:list').then((list) => {
      setRuntimes(list as AgentRuntime[])
    })
  }, [menuOpen, updateMenuPosition])

  React.useEffect(() => {
    if (!menuOpen) return
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (buttonRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('resize', updateMenuPosition)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('resize', updateMenuPosition)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen, updateMenuPosition])

  if (!state) return null
  if (!props.panels.some((panel) => isAgentPanelId(panel.id))) return null

  // The workspace the new agent joins: the focused one, or whichever holds the
  // active repo (a repo is always in at least its home workspace).
  const workspace = state.workspaces.find((w) => w.id === state.activeWorkspaceId)
    ?? state.workspaces.find((w) => w.projectIds.includes(state.activeProjectId ?? ''))
  const homeProjectId = state.activeProjectId && workspace?.projectIds.includes(state.activeProjectId)
    ? state.activeProjectId
    : workspace?.projectIds[0]

  const activeSession: AgentSession | null = state.sessionId
    ? Object.values(state.allProjectSessions).flat().find((s) => s.id === state.sessionId) ?? null
    : null
  const sessionProjectPath = activeSession
    ? state.projects.find((p) => p.id === activeSession.projectId)?.path ?? ''
    : ''

  const addAgent = (runtimeId: string, nonInteractive: boolean): void => {
    setMenuOpen(false)
    if (!workspace || !homeProjectId) return
    void state.onLaunchWorkspaceAgent?.(workspace.id, homeProjectId, {
      runtimeId,
      prompt: '',
      nonInteractive,
    })
  }

  const installed = runtimes.filter((r) => r.installed)

  return (
    <div style={styles.headerActions}>
      {activeSession && (
        <>
          <button
            type="button"
            style={styles.headerAddButton}
            className="agent-header-settings-button"
            onClick={() => setSettingsVisible(true)}
            title="Agent settings"
            aria-label="Agent settings"
          >
            ⚙
          </button>
          <AgentSettingsModal
            visible={settingsVisible}
            session={activeSession}
            fallbackName={activeSession.displayName?.trim()
              || formatBranchLabel(activeSession.branchName, sessionProjectPath)}
            onSave={(settings) => state.onRenameAgent(activeSession.id, settings)}
            onClose={() => setSettingsVisible(false)}
          />
        </>
      )}
      {workspace && homeProjectId && state.onLaunchWorkspaceAgent && (
        <div style={styles.headerAddMenu} onClick={(event) => event.stopPropagation()}>
          <button
            ref={buttonRef}
            type="button"
            style={styles.headerAddButton}
            className="agent-header-add-button"
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setMenuOpen(false)
            }}
            title={`New agent in ${workspace.name}`}
            aria-label={`New agent in ${workspace.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            +
          </button>
          {menuOpen && menuPosition && createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{ ...styles.shellTypeMenu, top: menuPosition.top, left: menuPosition.left }}
            >
              {installed.length === 0 && (
                <div style={{ ...styles.shellTypeMenuItem, cursor: 'default', opacity: 0.7 }}>
                  No agent runtimes installed
                </div>
              )}
              {installed.map((runtime) => (
                <React.Fragment key={runtime.id}>
                  <button
                    type="button"
                    role="menuitem"
                    style={styles.shellTypeMenuItem}
                    onClick={() => addAgent(runtime.id, false)}
                  >
                    New {runtimeLabel(runtime.id)} Terminal
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    style={styles.shellTypeMenuItem}
                    onClick={() => addAgent(runtime.id, true)}
                  >
                    New {runtimeLabel(runtime.id)} Chat
                  </button>
                </React.Fragment>
              ))}
            </div>,
            document.body,
          )}
        </div>
      )}
    </div>
  )
}
