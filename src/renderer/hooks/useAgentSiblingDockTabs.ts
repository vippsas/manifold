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

    const desiredSessions = activeWorktreePath
      ? sessions.filter(
          (s) => s.worktreePath === activeWorktreePath && s.id !== primarySessionId,
        )
      : []
    const desired = new Map(desiredSessions.map((s) => [s.id, s]))

    for (const panel of api.panels) {
      if (!isSiblingPanelId(panel.id)) continue
      const sid = parseSiblingSessionId(panel.id)
      if (!sid || !desired.has(sid)) {
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
      const activePanelId = siblingPanelId(activeSessionId)
      const activePanel = api.getPanel(activePanelId)
      if (activePanel && !activePanel.api.isActive) activePanel.api.setActive()
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
