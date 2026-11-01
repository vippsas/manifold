import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Project } from '../../../shared/types'
import { useProjects } from '../project/useProjects'
import { useAgentSession } from './useAgentSession'
import { useAllProjectSessions } from './useAllProjectSessions'
import { useWorkspaceEntry } from '../app/useWorkspaceEntry'
import { groupSessionsByWorkspace } from '../app/session-workspace-map'
import { mockInvoke, projects, makeSession, installElectronApi } from './useAllProjectSessions.test-helpers'

beforeEach(installElectronApi)

describe('project registry refresh and session discovery', () => {
  it('discovers all projects once, then only the incoming repo across cross-repo tab clicks', async () => {
    const one = makeSession('s1', 'p1')
    const two = makeSession('s2', 'p2')
    const workspaces = [{ id: 'w', name: 'Workspace', projectIds: ['p1', 'p2'], createdAt: '' }]
    mockInvoke.mockImplementation(async (channel: string, projectId: string) => {
      if (channel === 'projects:list') return structuredClone(projects)
      if (channel === 'agent:sessions') return projectId === 'p1' ? [one] : [two]
      throw new Error(`Unexpected IPC: ${channel}`)
    })
    const { result } = renderHook(() => {
      const project = useProjects()
      const agent = useAgentSession(project.activeProjectId)
      const all = useAllProjectSessions(project.projects, project.activeProjectId, agent.sessions, agent.loadedProjectId)
      const entry = useWorkspaceEntry({
        workspaces, sessionsByWorkspace: groupSessionsByWorkspace(all.sessionsByProject, workspaces),
        favorites: [], activeWorkspaceId: 'w', activeProjectId: project.activeProjectId,
        activeSessionId: agent.activeSessionId, selectSession: agent.setActiveSession,
        selectWorkspace: () => {}, setActiveProject: project.setActiveProject,
      })
      return { ...all, entry, projects: project.projects, loadedProjectId: agent.loadedProjectId }
    })
    await waitFor(() => expect(result.current.sessionsByProject).toEqual({ p1: [one], p2: [two] }))
    const discoveries = () => mockInvoke.mock.calls.filter(([channel]) => channel === 'agent:sessions')
    expect(discoveries()).toHaveLength(2)
    const initialProjects = result.current.projects
    for (const [index, selected] of [two, one, two, one].entries()) {
      await act(async () => { result.current.entry.setActiveSession(selected.id) })
      await waitFor(() => expect(result.current.loadedProjectId).toBe(selected.projectId))
      expect(discoveries()).toHaveLength(3 + index)
      expect(discoveries().at(-1)).toEqual(['agent:sessions', selected.projectId])
      expect(result.current.sessionsByProject).toEqual({ p1: [one], p2: [two] })
      expect(result.current.projects).toBe(initialProjects)
    }
    expect(mockInvoke.mock.calls.filter(([channel]) => channel === 'projects:list')).toHaveLength(6)
  })

  it('loads cached slash commands on a project switch without rediscovering every repo', async () => {
    let registry: Project[] = [...projects, { ...projects[1], id: 'p3', name: 'Project Three' }]
    mockInvoke.mockImplementation(async (channel: string) => {
      if (channel === 'projects:list') return structuredClone(registry)
      if (channel === 'agent:sessions') return []
      throw new Error(`Unexpected IPC: ${channel}`)
    })
    const { result } = renderHook(() => {
      const project = useProjects()
      const agent = useAgentSession(project.activeProjectId)
      useAllProjectSessions(project.projects, project.activeProjectId, agent.sessions, agent.loadedProjectId)
      return { ...project, loadedProjectId: agent.loadedProjectId }
    })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p1'))
    const initialProjects = result.current.projects
    expect(initialProjects.find(({ id }) => id === 'p1')?.slashCommands).toBeUndefined()
    const discoveries = () => mockInvoke.mock.calls.filter(([channel]) => channel === 'agent:sessions')
    expect(discoveries()).toHaveLength(3)
    // Main caches commands after the initial renderer load.
    registry = registry.map((project) => project.id === 'p1' ? { ...project, slashCommands: ['/foo'] } : project)
    await act(async () => { result.current.setActiveProject('p2') })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p2'))
    expect(result.current.projects.find(({ id }) => id === 'p1')?.slashCommands).toEqual(['/foo'])
    expect(result.current.projects).not.toBe(initialProjects)
    expect(discoveries()).toHaveLength(4)
    expect(discoveries().at(-1)).toEqual(['agent:sessions', 'p2'])

    const updatedProjects = result.current.projects
    await act(async () => { result.current.setActiveProject('p1') })
    await waitFor(() => expect(result.current.loadedProjectId).toBe('p1'))
    expect(result.current.projects).toBe(updatedProjects)
    expect(result.current.projects.find(({ id }) => id === 'p1')?.slashCommands).toEqual(['/foo'])
    expect(discoveries()).toHaveLength(5)
    expect(discoveries().filter(([, id]) => id === 'p3')).toHaveLength(1)
  })

})
