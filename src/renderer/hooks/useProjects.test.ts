import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProjects } from './useProjects'
import { mockInvoke, sampleProjects, installElectronApi } from './useProjects.test-helpers'

beforeEach(() => {
  vi.clearAllMocks()
  installElectronApi()
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

describe('useProjects', () => {
  it('fetches projects on mount', async () => {
    mockInvoke.mockResolvedValue(sampleProjects)

    const { result } = renderHook(() => useProjects())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockInvoke).toHaveBeenCalledWith('projects:list')
    expect(result.current.projects).toEqual(sampleProjects)
  })

  it('sorts fetched projects alphabetically by name', async () => {
    mockInvoke.mockResolvedValue([
      sampleProjects[1],
      sampleProjects[0],
    ])

    const { result } = renderHook(() => useProjects())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.projects.map((project) => project.name)).toEqual(['Project A', 'Project B'])
    expect(result.current.activeProjectId).toBe('p1')
  })

  it('sets the first project as active by default', async () => {
    mockInvoke.mockResolvedValue(sampleProjects)

    const { result } = renderHook(() => useProjects())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.activeProjectId).toBe('p1')
  })

  it('handles fetch error', async () => {
    mockInvoke.mockRejectedValue(new Error('fetch failed'))

    const { result } = renderHook(() => useProjects())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('fetch failed')
    expect(result.current.projects).toEqual([])
  })

  describe('addProject', () => {
    it('adds a project with a given path', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // initial list
        .mockResolvedValueOnce({ id: 'p-new', name: 'New', path: '/new', baseBranch: 'main', addedAt: '2024-01-01' }) // add

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject('/new')
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:add', '/new')
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.activeProjectId).toBe('p-new')
    })

    it('can add a project without activating it', async () => {
      const addedProject = { id: 'p-new', name: 'Aardvark', path: '/aardvark', baseBranch: 'main', addedAt: '2024-01-03' }
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(sampleProjects)
        if (channel === 'projects:add') return Promise.resolve(addedProject)
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject('/aardvark', { activate: false })
      })

      expect(result.current.activeProjectId).toBe('p1')
      expect(result.current.projects.map((project) => project.name)).toEqual(['Aardvark', 'Project A', 'Project B'])
    })

    it('opens a dialog when no path provided', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // initial list
        .mockResolvedValueOnce('/selected/path') // open-dialog
        .mockResolvedValueOnce({ id: 'p-sel', name: 'Selected', path: '/selected/path', baseBranch: 'main', addedAt: '2024-01-01' }) // add

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject()
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:open-dialog')
      expect(mockInvoke).toHaveBeenCalledWith('projects:add', '/selected/path')
    })

    it('does nothing when dialog is cancelled', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // initial list
        .mockResolvedValueOnce(undefined) // open-dialog returns undefined (cancelled)

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject()
      })

      expect(result.current.projects).toEqual([])
    })

    it('sets error when add fails', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // initial list
        .mockRejectedValueOnce(new Error('add failed')) // add

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.addProject('/bad')
      })

      expect(result.current.error).toBe('add failed')
    })
  })

  describe('createNewProject', () => {
    it('prompts for a target directory and creates the project there', async () => {
      const createdProject = { id: 'p-new', name: 'Timer', path: '/picked/timer', baseBranch: 'main', addedAt: '2024-01-03' }
      let listedProjects: typeof sampleProjects | typeof createdProject[] = []
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(listedProjects)
        if (channel === 'projects:create-new-dialog') return Promise.resolve('/picked/timer')
        if (channel === 'projects:create-new') {
          listedProjects = [createdProject]
          return Promise.resolve(createdProject)
        }
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createNewProject({
          description: 'Build a timer app',
        })
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:create-new-dialog', 'Build a timer app')
      expect(mockInvoke).toHaveBeenCalledWith('projects:create-new', {
        description: 'Build a timer app',
        targetDir: '/picked/timer',
      })
      expect(result.current.projects).toContainEqual(createdProject)
      expect(result.current.activeProjectId).toBe('p-new')
    })

    it('returns null when the user cancels the directory picker', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve([])
        if (channel === 'projects:create-new-dialog') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let returned: unknown
      await act(async () => {
        returned = await result.current.createNewProject({ description: 'Build a timer app' })
      })

      expect(returned).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalledWith('projects:create-new', expect.anything())
    })

    it('sets error when project creation fails', async () => {
      mockInvoke
        .mockResolvedValueOnce([]) // projects:list on mount
        .mockResolvedValueOnce('/picked/timer') // projects:create-new-dialog
        .mockRejectedValueOnce(new Error('Directory already exists: /picked/timer'))

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createNewProject({
          description: 'Build a timer app',
        })
      })

      expect(result.current.error).toBe('Directory already exists: /picked/timer')
    })
  })

})
