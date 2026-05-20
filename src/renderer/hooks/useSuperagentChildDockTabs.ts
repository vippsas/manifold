import { useEffect, useMemo, useRef } from 'react'
import type { DockviewApi } from 'dockview'
import type { Project, AgentSession } from '../../shared/types'
import type { Superagent } from '../../shared/superagent-types'
import { isSiblingPanelId, parseSiblingSessionId, siblingPanelId } from './agent-siblings'

interface SuperagentChildEntry {
  session: AgentSession
  project: Project
}

interface Options {
  apiRef: React.MutableRefObject<DockviewApi | null>
  layoutVersion: number
  superagent: Superagent | null
  projects: Project[]
  allProjectSessions: Record<string, AgentSession[]>
  onSelectChildSession: (sessionId: string, projectId: string) => void
  onSelectSuperagentHome: () => void
}

function resolveChildSessions(
  superagent: Superagent | null,
  projects: Project[],
  allProjectSessions: Record<string, AgentSession[]>,
): SuperagentChildEntry[] {
  if (!superagent) return []

  const projectById = new Map(projects.map((project) => [project.id, project]))
  const sessionById = new Map<string, AgentSession>()

  for (const projectId of superagent.fleetProjectIds) {
    for (const session of allProjectSessions[projectId] ?? []) {
      sessionById.set(session.id, session)
    }
  }

  const resolved: SuperagentChildEntry[] = []
  for (const sessionId of superagent.childSessionIds) {
    const session = sessionById.get(sessionId)
    if (!session) continue
    const project = projectById.get(session.projectId)
    if (!project) continue
    resolved.push({ session, project })
  }

  return resolved
}

export function useSuperagentChildDockTabs({
  apiRef,
  layoutVersion,
  superagent,
  projects,
  allProjectSessions,
  onSelectChildSession,
  onSelectSuperagentHome,
}: Options): void {
  const childSessions = useMemo(
    () => resolveChildSessions(superagent, projects, allProjectSessions),
    [allProjectSessions, projects, superagent],
  )

  const childProjectBySessionIdRef = useRef<Map<string, string>>(new Map())
  childProjectBySessionIdRef.current = new Map(
    childSessions.map(({ session, project }) => [session.id, project.id]),
  )

  const onSelectChildSessionRef = useRef(onSelectChildSession)
  onSelectChildSessionRef.current = onSelectChildSession

  const onSelectSuperagentHomeRef = useRef(onSelectSuperagentHome)
  onSelectSuperagentHomeRef.current = onSelectSuperagentHome

  useEffect(() => {
    const api = apiRef.current
    if (!api || !superagent) return

    const agentPanel = api.getPanel('agent')
    if (!agentPanel) return

    // Source of truth for "which sibling panels should exist" is the
    // superagent's childSessionIds — NOT `childSessions`, which depends on
    // sessionsByProject and goes stale during a project switch. Clicking a
    // sub-agent calls setActiveProject, and until the async refetch completes,
    // resolveChildSessions can't find the session and would drop it from
    // `childSessions`. Removing the (active) panel here makes dockview
    // auto-activate a neighbor (e.g. Search), losing focus on the sub-agent.
    const desiredChildSessionIds = new Set(superagent.childSessionIds)

    for (const panel of [...api.panels]) {
      if (!isSiblingPanelId(panel.id)) continue
      const sessionId = parseSiblingSessionId(panel.id)
      if (!sessionId || desiredChildSessionIds.has(sessionId)) continue
      api.removePanel(panel)
    }

    for (const [index, { session, project }] of childSessions.entries()) {
      const panelId = siblingPanelId(session.id)
      let panel = api.getPanel(panelId)

      if (!panel) {
        api.addPanel({
          id: panelId,
          component: 'agent',
          title: project.name,
          position: {
            referencePanel: 'agent',
            direction: 'within',
            index: index + 1,
          },
          inactive: true,
        })
        panel = api.getPanel(panelId)
      }

      if (!panel) continue
      if (panel.title !== project.name) panel.api.setTitle(project.name)

      const expectedIndex = index + 1
      const superagentGroup = agentPanel.group
      const isInExpectedGroup = panel.group === superagentGroup
      const isInExpectedSlot = superagentGroup.panels[expectedIndex]?.id === panelId

      if (!isInExpectedGroup || !isInExpectedSlot) {
        panel.api.moveTo({
          group: superagentGroup,
          index: expectedIndex,
          skipSetActive: true,
        })
      }
    }
  }, [apiRef, childSessions, layoutVersion, superagent])

  useEffect(() => {
    const api = apiRef.current
    if (!api || !superagent) return

    const subscription = api.onDidActivePanelChange((panel) => {
      if (!panel) return

      if (panel.id === 'agent') {
        onSelectSuperagentHomeRef.current()
        return
      }

      const sessionId = parseSiblingSessionId(panel.id)
      if (!sessionId) return

      const projectId = childProjectBySessionIdRef.current.get(sessionId)
      if (projectId) onSelectChildSessionRef.current(sessionId, projectId)
    })

    return () => subscription.dispose()
  }, [apiRef, layoutVersion, superagent])
}
