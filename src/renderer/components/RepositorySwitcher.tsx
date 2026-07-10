import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSession } from '../../shared/types'
import { useDockState } from './editor/editor-shell/dock-panel-types'
import { AgentItem } from './sidebar/AgentItem'
import { sidebarStyles } from './sidebar/ProjectSidebar.styles'
import { repositorySwitcherStyles as styles } from './RepositorySwitcher.styles'

interface ChatEntry {
  session: AgentSession
  projectId: string
  projectPath: string
}

/**
 * Title-bar chat switcher. A compact button shows the current chat; the dropdown
 * is a flat list of every chat (agent session) to switch between, plus a "New
 * chat" action. Reads DockStateContext and reuses the sidebar `AgentItem` row so
 * rename/delete/outputting behavior stays consistent. Repositories, workspaces
 * and drafts management were intentionally removed — a chat's context is simply
 * the folders shown in the Explorer (worktree + folders added with the "+").
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

  const projectPathById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of s.projects) map.set(p.id, p.path)
    return map
  }, [s.projects])

  const chats = useMemo<ChatEntry[]>(() => {
    const entries: ChatEntry[] = []
    for (const [projectId, sessions] of Object.entries(s.allProjectSessions)) {
      const projectPath = projectPathById.get(projectId) ?? ''
      for (const session of sessions) entries.push({ session, projectId, projectPath })
    }
    return entries
  }, [s.allProjectSessions, projectPathById])

  const activeChat = chats.find((c) => c.session.id === s.sessionId)
  const label = activeChat?.session.displayName?.trim()
    || (s.primaryBranch ? s.primaryBranch.replace(/^manifold\//, '') : null)
    || 'No chat'

  return (
    <div ref={rootRef} style={styles.root}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch chat"
        style={styles.button}
        className="titlebar-repo-switcher"
      >
        <span aria-hidden style={styles.icon}>◐</span>
        <span className="truncate" style={styles.label}>{label}</span>
        <span aria-hidden style={styles.chevron}>▾</span>
      </button>
      {open && (
        <div style={styles.dropdown} role="menu" aria-label="Chats">
          <div style={styles.list}>
            {chats.length === 0 ? (
              <div style={styles.empty}>No chats yet.</div>
            ) : (
              chats.map(({ session, projectId, projectPath }) => (
                <AgentItem
                  key={session.id}
                  session={session}
                  projectPath={projectPath}
                  isActive={session.id === s.sessionId}
                  isOutputting={s.outputtingSessionIds.has(session.id)}
                  onSelect={(id) => { s.onSelectSession(id, projectId); close() }}
                  onDelete={() => s.onRequestDeleteAgent(session, projectPath)}
                  onRename={(name) => s.onRenameAgent(session.id, name)}
                />
              ))
            )}
          </div>
          <div style={styles.footer}>
            <button
              type="button"
              onClick={() => { s.onNewAgentFromHeader(); close() }}
              className="sidebar-action-button sidebar-action-button--primary"
              style={{ ...sidebarStyles.actionButtonPrimary, ...styles.newChat }}
            >
              + New chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
