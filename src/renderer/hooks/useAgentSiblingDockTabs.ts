import { useEffect, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import type { AgentSession } from '../../shared/types'
import { isSiblingPanelId, parseSiblingSessionId, siblingPanelId } from './agent-siblings'
import { findTopLeftWorkspaceReferencePanel } from './dock-layout/dock-layout-helpers'

interface Options {
  apiRef: React.MutableRefObject<DockviewApi | null>
  layoutVersion: number
  /** Bumps only when the dock layout is fully reloaded (repo/agent switch). Used
   *  to realign the dock to the restored active session after a reload (#773). */
  layoutReloadVersion?: number
  /** True while the dock layout is being restored (api.fromJSON). Restore-driven
   *  panel activations must not re-select their session (#773). */
  isRestoringRef?: React.MutableRefObject<boolean>
  /** The agent restored from per-project memory on the latest repo switch (null
   *  on a cold entry). Only this remembered agent is protected from / realigned
   *  after layout restore, so cold-start restore is left to the dock (#773). */
  rememberedActiveSessionRef?: React.MutableRefObject<string | null>
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

// Primary and sibling tabs share one naming rule (display name, then runtime
// label) so the first tab doesn't read "Agent" next to siblings named "Codex".
function primaryTabTitle(session: AgentSession | null | undefined): string {
  return session ? tabTitle(session) : 'Agent'
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
  layoutReloadVersion,
  isRestoringRef,
  rememberedActiveSessionRef,
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
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const prevActiveSessionIdRef = useRef<string | null | undefined>(undefined)

  // A repo re-entry restores a remembered agent (rememberedActiveSessionRef);
  // the dock must keep showing exactly that agent across the layout reload.
  // True only while the active session still is that remembered agent — once
  // the user picks a different agent, dock activation drives selection again.
  const isProtectedRestore = (): boolean =>
    !!rememberedActiveSessionRef?.current &&
    rememberedActiveSessionRef.current === activeSessionIdRef.current

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

    // Only follow the active session into its dock tab when it actually
    // changed (e.g. the user picked it in the sidebar). This effect also re-runs
    // on unrelated changes — opening a file bumps layoutVersion, streaming
    // output bumps `sessions` — and force-activating here would yank focus back
    // to the agent terminal from the editor the user just opened (#296).
    const activeSessionChanged = prevActiveSessionIdRef.current !== activeSessionId
    prevActiveSessionIdRef.current = activeSessionId

    if (activeSessionChanged && activeSessionId && activeSessionId !== primarySessionId) {
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

  // After a repo re-entry reloads the dock, dockview's fromJSON re-activates
  // whichever agent tab the saved layout marked active — which can differ from
  // the agent useAgentSession remembered for this repo. Realign the dock to the
  // remembered agent so the last-viewed agent is the one shown, and so the
  // post-reload activation (and its replayed re-subscribe, below) can't leave a
  // stale agent tab visible or re-select it (#773). Scoped to a protected
  // restore so a cold entry keeps the dock's own restored active panel; only
  // corrects agent-tab mismatches, leaving a restored editor/other pane alone.
  useEffect(() => {
    const api = apiRef.current
    if (!api || disabled || !isProtectedRestore()) return
    const activeId = activeSessionIdRef.current
    if (!activeId) return
    const active = api.activePanel
    if (!active || (active.id !== 'agent' && !isSiblingPanelId(active.id))) return
    const targetId = activeId === primaryRef.current ? 'agent' : siblingPanelId(activeId)
    if (active.id === targetId) return
    const target = api.getPanel(targetId)
    if (target && !target.api.isActive) target.api.setActive()
  }, [apiRef, disabled, layoutReloadVersion])

  useEffect(() => {
    const api = apiRef.current
    if (!api) return
    if (disabled) return
    const sub = api.onDidActivePanelChange((panel) => {
      if (!panel) return
      // A dock layout reload (api.fromJSON) re-activates the saved active panel;
      // selecting its session here would overwrite the agent useAgentSession
      // remembered for this repo (#773). Skip only while restoring a protected
      // (remembered) repo re-entry — a cold entry still lets the dock's restored
      // active panel drive selection.
      if (isRestoringRef?.current && isProtectedRestore()) return
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
