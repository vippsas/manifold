import React, { useMemo, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import type { AgentSession, Project, ResolvedFavorite } from '../../../shared/types'
import type { Workspace } from '../../../shared/workspace-types'
import { useAgentSession } from '../agent-session/useAgentSession'
import { useAllProjectSessions } from '../agent-session/useAllProjectSessions'
import { useAgentSiblingDockTabs } from '../agent-session/useAgentSiblingDockTabs'
import { siblingPanelId } from '../agent-session/agent-siblings'
import { useDockLayout } from '../dock-layout/useDockLayout'
import { useCommands } from './useCommands'
import type { CommandContext } from '../../commands/command-handlers'
import { groupSessionsByWorkspace } from './session-workspace-map'
import { useWorkspaceEntry } from './useWorkspaceEntry'
import { WorkspaceCard } from '../../components/sidebar/WorkspaceCard'
import { FavoritesList } from '../../components/sidebar/FavoritesList'
import { DockStateContext, type DockAppState } from '../../components/editor/editor-shell/dock-panel-types'
import { installLocalStorage } from '../../components/sidebar/ProjectSidebar.test-helpers'

const projects: Project[] = ['p1', 'p2', 'p3'].map((id) => ({
  id, name: id, path: `/repo/${id}`, baseBranch: 'main', addedAt: '',
}))
const workspaces: Workspace[] = [
  { id: 'w1', name: 'One', projectIds: ['p1', 'p3'], createdAt: '' },
  { id: 'w2', name: 'Two', projectIds: ['p2'], createdAt: '' },
]
const favorites: ResolvedFavorite[] = [{ id: 'w1', name: 'Favorite One', kind: 'multi' }]
const sessions: AgentSession[] = [
  { id: 'a', projectId: 'p1', workspaceId: 'w1' },
  { id: 'b', projectId: 'p1', workspaceId: 'w1' },
  { id: 'c', projectId: 'p2', workspaceId: 'w2' },
  { id: 'd', projectId: 'p3', workspaceId: 'w1' },
].map((s) => ({
  ...s, runtimeId: 'codex', branchName: '', worktreePath: `/wt/${s.id}`,
  status: 'running', pid: 1, additionalDirs: [],
}))

// Only the preload boundary is faked; navigation, sessions, grouping and dock
// reconciliation all use the app's real implementations.
beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  })
})
beforeEach(() => {
  installLocalStorage()
  let layout: SerializedDockview | null = null
  window.electronAPI = {
    invoke: vi.fn(async (channel: string, arg: unknown) => {
      if (channel === 'agent:sessions') return sessions.filter((s) => s.projectId === arg)
      if (channel === 'dock-layout:get') return layout
      if (channel === 'dock-layout:set') { layout = arg as SerializedDockview; return }
      throw new Error(`Unexpected IPC: ${channel}`)
    }),
    on: vi.fn(() => () => {}), send: vi.fn(), getPathForFile: vi.fn(),
  }
})

function Probe(props: IDockviewPanelProps): React.JSX.Element {
  return <div>{props.api.id}</div>
}
const components = { agent: Probe, editor: Probe, shell: Probe, sidebar: Probe }
interface Handle {
  api: DockviewApi | null
  primarySessionId: string | null
  activeSessionId: string | null
  runCommand: (id: string) => void
}

function Harness({ handle }: { handle: { current: Handle | null } }): React.JSX.Element {
  const [activeProjectId, setActiveProject] = useState<string | null>('p1')
  const [activeWorkspaceId, selectWorkspace] = useState<string | null>('w1')
  const agent = useAgentSession(activeProjectId)
  const { sessionsByProject } = useAllProjectSessions(projects, activeProjectId, agent.sessions)
  const sessionsByWorkspace = useMemo(
    () => groupSessionsByWorkspace(sessionsByProject, workspaces), [sessionsByProject],
  )
  const entry = useWorkspaceEntry({
    workspaces, sessionsByWorkspace, favorites, activeProjectId, activeWorkspaceId,
    activeSessionId: agent.activeSessionId,
    selectSession: agent.setActiveSession, selectWorkspace, setActiveProject,
  })
  const workspaceSessions = sessionsByWorkspace[activeWorkspaceId ?? ''] ?? []
  const primarySessionId = workspaceSessions[0]?.id ?? null
  const dock = useDockLayout(agent.activeSessionId, workspaceSessions)
  useAgentSiblingDockTabs({
    apiRef: dock.apiRef, layoutVersion: dock.layoutVersion,
    layoutReloadVersion: dock.layoutReloadVersion, isRestoringRef: dock.isRestoringRef,
    rememberedActiveSessionRef: agent.rememberedActiveSessionRef,
    sessions: workspaceSessions, activeWorktreePath: agent.activeSession?.worktreePath ?? null,
    primarySessionId, activeSessionId: agent.activeSessionId, onSelectSession: entry.setActiveSession,
  })
  const { runCommand } = useCommands({ jumpToFavorite: entry.jumpToFavorite } as CommandContext)
  handle.current = { api: dock.apiRef.current, primarySessionId, activeSessionId: agent.activeSessionId, runCommand }
  const dockState = {
    favorites, onActivateFavorite: entry.activateFavorite,
    onReorderFavorites: () => {}, isFavorite: () => true, onToggleFavorite: () => {},
  } as unknown as DockAppState
  return (
    <DockStateContext.Provider value={dockState}>
      <FavoritesList />
      <div data-testid="cards">
        {workspaces.map((workspace) => (
          <WorkspaceCard key={workspace.id} workspace={workspace} projects={projects}
            isActive={activeWorkspaceId === workspace.id} expanded={false} onToggleExpanded={() => {}}
            sessions={sessionsByWorkspace[workspace.id] ?? []} drafts={[]} activeDraftId={null}
            onSelectWorkspace={entry.enterWorkspace} onRemoveWorkspace={() => {}}
            onSelectDraft={() => {}} onDiscardDraft={() => {}} />
        ))}
      </div>
      <DockviewReact components={components} onReady={(e) => dock.onReady(e.api)} />
    </DockStateContext.Provider>
  )
}

describe('workspace navigation restores the dock tab (#945)', () => {
  it.each(['sidebar', 'favorite', 'shortcut'])('restores the last clicked tab through %s', async (route) => {
    const handle: { current: Handle | null } = { current: null }
    render(<Harness handle={handle} />)
    await waitFor(() => expect(handle.current?.api?.getPanel(siblingPanelId('b'))).toBeDefined())
    // Real dock activation drives setActiveSession, as a tab click does.
    act(() => { handle.current!.api!.getPanel(siblingPanelId('b'))!.api.setActive() })
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('b'))

    fireEvent.click(within(screen.getByTestId('cards')).getByText('Two'))
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('c'))
    if (route === 'sidebar') fireEvent.click(within(screen.getByTestId('cards')).getByText('One'))
    else if (route === 'favorite') fireEvent.click(screen.getByText('Favorite One'))
    else act(() => { handle.current!.runCommand('navigation.favorite.1') })

    await waitFor(() => expect(handle.current?.activeSessionId).toBe('b'))
    await waitFor(() => expect(handle.current?.api?.activePanel?.id).toBe(
      handle.current?.primarySessionId === 'b' ? 'agent' : siblingPanelId('b'),
    ))
  })
})
