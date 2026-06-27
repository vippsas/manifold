import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProjectCreateHandlers } from './useProjectCreateHandlers'
import type { AgentSession, Project, SpawnAgentOptions } from '../../../shared/types'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: vi.fn(() => vi.fn()),
  }
})

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'pixel-forge',
    path: '/projects/pixel-forge',
    baseBranch: 'main',
    ...overrides,
  } as Project
}

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'session-1',
    projectId: 'p1',
    runtimeId: 'claude',
    branchName: 'manifold/oslo',
    worktreePath: '/wt1',
    status: 'running',
    pid: 1,
    additionalDirs: [],
    ...overrides,
  }
}

function makeArgs(overrides: Partial<Parameters<typeof useProjectCreateHandlers>[0]> = {}) {
  return {
    createNewProject: vi.fn().mockResolvedValue(makeProject()),
    addProject: vi.fn().mockResolvedValue(undefined),
    cloneProject: vi.fn().mockResolvedValue(true),
    spawnAgent: vi.fn().mockResolvedValue(makeSession()),
    setActiveSession: vi.fn(),
    clearActiveWorkspace: vi.fn(),
    defaultRuntime: 'claude',
    appEffects: {
      setCreatingProject: vi.fn(),
      setCloningProject: vi.fn(),
      setShowOnboarding: vi.fn(),
    },
    ...overrides,
  }
}

describe('useProjectCreateHandlers.handleCreateNewProject', () => {
  it('spawns the agent in chat mode with the description as both prompt and userMessage', async () => {
    const spawnAgent = vi.fn().mockResolvedValue(makeSession())
    const args = makeArgs({ spawnAgent })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(spawnAgent).toHaveBeenCalledTimes(1)
    const opts = spawnAgent.mock.calls[0][0] as SpawnAgentOptions
    expect(opts.prompt).toBe('Create a webapp.')
    expect(opts.userMessage).toBe('Create a webapp.')
    expect(opts.nonInteractive).toBe(true)
    expect(opts.projectId).toBe('p1')
    expect(opts.noWorktree).toBe(true)
    expect(opts.stayOnBranch).toBe(true)
    expect(opts.branchName).toBe('main')
    expect(mockInvoke).not.toHaveBeenCalledWith('branch:suggest', expect.anything())
  })

  it('spawns copied-instruction projects without a worktree and keeps clone instructions at the project root', async () => {
    const spawnAgent = vi.fn().mockResolvedValue(makeSession({ noWorktree: true }))
    const args = makeArgs({
      createNewProject: vi.fn().mockResolvedValue(makeProject({ kind: 'folder', baseBranch: '' })),
      spawnAgent,
    })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({
        description: 'Clone the prepared repository and continue.',
        projectKind: 'folder',
      })
    })

    expect(mockInvoke).not.toHaveBeenCalledWith('branch:suggest', expect.anything())
    const opts = spawnAgent.mock.calls[0][0] as SpawnAgentOptions
    expect(opts.prompt).toContain('use the current working directory as the project root')
    expect(opts.prompt).toContain('git clone <url> .')
    expect(opts.prompt).toContain('Clone the prepared repository and continue.')
    expect(opts.userMessage).toBe('Clone the prepared repository and continue.')
    expect(opts.branchName).toBe('pixel-forge')
    expect(opts.noWorktree).toBe(true)
  })

  it('spawns copied-instruction repositories in place when creation already cloned the repo', async () => {
    const spawnAgent = vi.fn().mockResolvedValue(makeSession({ noWorktree: true }))
    const args = makeArgs({
      createNewProject: vi.fn().mockResolvedValue(makeProject({ kind: 'git', baseBranch: 'main' })),
      spawnAgent,
    })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({
        description: 'Clone https://github.com/sven/pixel-forge.git and continue.',
        projectKind: 'folder',
      })
    })

    const opts = spawnAgent.mock.calls[0][0] as SpawnAgentOptions
    expect(opts.prompt).toContain('has already been cloned into the current working directory')
    expect(opts.prompt).toContain('Do not clone it again')
    expect(opts.userMessage).toBe('Clone https://github.com/sven/pixel-forge.git and continue.')
    expect(opts.branchName).toBe('main')
    expect(opts.noWorktree).toBe(true)
    expect(opts.stayOnBranch).toBe(true)
  })

  it('subscribes the spawned session to chat-message events so the first message appears', async () => {
    const spawnAgent = vi.fn().mockResolvedValue(makeSession({ id: 'session-created' }))
    const args = makeArgs({ spawnAgent })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(mockInvoke).toHaveBeenCalledWith('simple:subscribe-chat', 'session-created')
  })

  it('keeps the creating cover up on success so the chat reveal is deferred to the active-session effect', async () => {
    const setActiveSession = vi.fn()
    const setCreatingProject = vi.fn()
    const args = makeArgs({
      setActiveSession,
      spawnAgent: vi.fn().mockResolvedValue(makeSession({ id: 'session-created' })),
      appEffects: { setCreatingProject, setCloningProject: vi.fn(), setShowOnboarding: vi.fn() },
    })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    // Any stale session is cleared up front, the new one selected after spawn.
    expect(setActiveSession).toHaveBeenNthCalledWith(1, null)
    expect(setActiveSession).toHaveBeenLastCalledWith('session-created')
    // Cover raised, but never lowered here — the reveal effect owns that.
    expect(setCreatingProject).toHaveBeenCalledWith(true)
    expect(setCreatingProject).not.toHaveBeenCalledWith(false)
  })

  it('lowers the creating cover when the spawned session is null', async () => {
    const setCreatingProject = vi.fn()
    const args = makeArgs({
      spawnAgent: vi.fn().mockResolvedValue(null),
      appEffects: { setCreatingProject, setCloningProject: vi.fn(), setShowOnboarding: vi.fn() },
    })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    let created = true
    await act(async () => {
      created = await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(created).toBe(false)
    expect(setCreatingProject).toHaveBeenCalledWith(false)
  })

  it('returns false and does not spawn when project creation is cancelled', async () => {
    const spawnAgent = vi.fn()
    const args = makeArgs({ spawnAgent, createNewProject: vi.fn().mockResolvedValue(null) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    let created = true
    await act(async () => {
      created = await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(created).toBe(false)
    expect(spawnAgent).not.toHaveBeenCalled()
  })

  it('clears the focused workspace so the new repo surfaces as the active card', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(clearActiveWorkspace).toHaveBeenCalledTimes(1)
  })

  it('does not clear the focused workspace when creation is cancelled', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace, createNewProject: vi.fn().mockResolvedValue(null) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCreateNewProject({ description: 'Create a webapp.' })
    })

    expect(clearActiveWorkspace).not.toHaveBeenCalled()
  })
})

describe('useProjectCreateHandlers.handleAddProjectFromOnboarding', () => {
  it('clears the focused workspace after a repo is added', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace, addProject: vi.fn().mockResolvedValue(makeProject()) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleAddProjectFromOnboarding('/projects/pixel-forge')
    })

    expect(clearActiveWorkspace).toHaveBeenCalledTimes(1)
    expect(args.appEffects.setShowOnboarding).toHaveBeenCalledWith(false)
  })

  it('does not clear the focused workspace when the add is cancelled', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace, addProject: vi.fn().mockResolvedValue(null) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleAddProjectFromOnboarding()
    })

    expect(clearActiveWorkspace).not.toHaveBeenCalled()
  })
})

describe('useProjectCreateHandlers.handleCloneFromOnboarding', () => {
  it('clears the focused workspace after a successful clone', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace, cloneProject: vi.fn().mockResolvedValue(true) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCloneFromOnboarding('https://github.com/sven/pixel-forge.git')
    })

    expect(clearActiveWorkspace).toHaveBeenCalledTimes(1)
    expect(args.appEffects.setShowOnboarding).toHaveBeenCalledWith(false)
  })

  it('does not clear the focused workspace when the clone is cancelled', async () => {
    const clearActiveWorkspace = vi.fn()
    const args = makeArgs({ clearActiveWorkspace, cloneProject: vi.fn().mockResolvedValue(false) })
    const { result } = renderHook(() => useProjectCreateHandlers(args))

    await act(async () => {
      await result.current.handleCloneFromOnboarding('https://github.com/sven/pixel-forge.git')
    })

    expect(clearActiveWorkspace).not.toHaveBeenCalled()
    expect(args.appEffects.setShowOnboarding).not.toHaveBeenCalled()
  })
})
