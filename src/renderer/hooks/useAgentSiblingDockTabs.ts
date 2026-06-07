import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import type { AgentSession } from '../../shared/types'
import { isSiblingPanelId, parseSiblingSessionId, siblingPanelId } from './agent-siblings'
import { findTopLeftWorkspaceReferencePanel } from './dock-layout/dock-layout-helpers'

interface Options {
  apiRef: React.MutableRefObject<DockviewApi | null>
  layoutVersion: number
  sessions: AgentSession[]
  activeWorktreePath: string | null
  primarySessionId: string | null
  activeSessionId: string | null
  disabled?: boolean
  onSelectSession: (sessionId: string) => void
}

function tabTitle(session: AgentSession): string {
  const displayName = session.displayName?.trim()
  if (displayName) return displayName
  const runtime = RUNTIME_LABELS[session.runtimeId] ?? session.runtimeId
  return runtime
}

function primaryTabTitle(session: AgentSession | null | undefined): string {
  return session?.displayName?.trim() || 'Agent'
}

function setPanelTitle(panel: unknown, title: string): void {
  const target = panel as { title?: string; api?: { title?: string; setTitle?: (title: string) => void } }
  if (target.title === title || target.api?.title === title) return
  target.api?.setTitle?.(title)
}

const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

export function useAgentSiblingDockTabs({
  apiRef,
  layoutVersion,
  sessions,
  activeWorktreePath,
  primarySessionId,
  activeSessionId,
  disabled = false,
  onSelectSession,
}: Options): void {
  const onSelectRef = useRef(onSelectSession)
  onSelectRef.current = onSelectSession
  const primaryRef = useRef(primarySessionId)
  primaryRef.current = primarySessionId

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (disabled) return
    if (!api.getPanel('agent')) return
    if (activeSessionId && !activeWorktreePath) return

    const primaryPanel = api.getPanel('agent')
    const primarySession = primarySessionId
      ? sessions.find((s) => s.id === primarySessionId)
      : null
    if (primaryPanel) setPanelTitle(primaryPanel, primaryTabTitle(primarySession))

    const siblingsOnWorktree = activeWorktreePath
      ? sessions.filter(
          (s) => s.worktreePath === activeWorktreePath && s.id !== primarySessionId,
        )
      : []
    // Auto-tabbed: ungrouped siblings only. Grouped siblings (e.g. playlist
    // runs) are opened on demand by their owner UI to keep the dock bar clean.
    const desiredSessions = siblingsOnWorktree.filter((s) => !s.groupId)
    const desired = new Map(desiredSessions.map((s) => [s.id, s]))
    // Tabs are removed only when the underlying session is gone (closed or
    // moved off this worktree). Grouped sibling tabs that were manually
    // opened stay open until the session itself is gone.
    const knownSessionIds = new Set(siblingsOnWorktree.map((s) => s.id))

    for (const panel of api.panels) {
      if (!isSiblingPanelId(panel.id)) continue
      const sid = parseSiblingSessionId(panel.id)
      if (!sid || !knownSessionIds.has(sid)) {
        api.removePanel(panel)
      }
    }

    for (const session of siblingsOnWorktree) {
      const panel = api.getPanel(siblingPanelId(session.id))
      if (panel) setPanelTitle(panel, tabTitle(session))
    }

    for (const session of desiredSessions) {
      const panelId = siblingPanelId(session.id)
      if (api.getPanel(panelId)) continue
      const referencePanelId = findTopLeftWorkspaceReferencePanel(api) ?? 'agent'
      api.addPanel({
        id: panelId,
        component: 'agent',
        title: tabTitle(session),
        position: { referencePanel: referencePanelId, direction: 'within' },
        inactive: session.id !== activeSessionId,
      })
    }

    if (activeSessionId && activeSessionId !== primarySessionId) {
      // Don't force-activate grouped siblings (e.g. Watch playlist agents).
      // Their owner UI manages navigation; this auto-activate would snap the
      // user back every time sessions update (status changes, etc.).
      const activeSession = sessions.find((s) => s.id === activeSessionId)
      if (!activeSession?.groupId) {
        const activePanelId = siblingPanelId(activeSessionId)
        const activePanel = api.getPanel(activePanelId)
        if (activePanel && !activePanel.api.isActive) activePanel.api.setActive()
      }
    }
  }, [apiRef, disabled, layoutVersion, sessions, activeWorktreePath, primarySessionId, activeSessionId])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (disabled) return
    const sub = api.onDidActivePanelChange((panel) => {
      if (!panel) return
      if (panel.id === 'agent') {
        const primary = primaryRef.current
        if (primary) onSelectRef.current(primary)
        return
      }
      const sid = parseSiblingSessionId(panel.id)
      if (sid) onSelectRef.current(sid)
    })
    return () => sub.dispose()
  }, [apiRef, disabled, layoutVersion])
}
