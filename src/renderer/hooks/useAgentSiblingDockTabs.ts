import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import type { AgentSession } from '../../shared/types'
import { isSiblingPanelId, parseSiblingSessionId, siblingPanelId } from './agent-siblings'

interface Options {
  apiRef: React.MutableRefObject<DockviewApi | null>
  layoutVersion: number
  sessions: AgentSession[]
  activeWorktreePath: string | null
  primarySessionId: string | null
  activeSessionId: string | null
  onSelectSession: (sessionId: string) => void
}

function tabTitle(session: AgentSession): string {
  const runtime = RUNTIME_LABELS[session.runtimeId] ?? session.runtimeId
  return runtime
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
  onSelectSession,
}: Options): void {
  const onSelectRef = useRef(onSelectSession)
  onSelectRef.current = onSelectSession
  const primaryRef = useRef(primarySessionId)
  primaryRef.current = primarySessionId

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (!api.getPanel('agent')) return

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

    for (const session of desiredSessions) {
      const panelId = siblingPanelId(session.id)
      if (api.getPanel(panelId)) continue
      api.addPanel({
        id: panelId,
        component: 'agent',
        title: tabTitle(session),
        position: { referencePanel: 'agent', direction: 'within' },
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
  }, [apiRef, layoutVersion, sessions, activeWorktreePath, primarySessionId, activeSessionId])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
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
  }, [apiRef, layoutVersion])
}
