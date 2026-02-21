import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

const sampleProjects = [
  { id: 'p1', name: 'Project A', path: '/a', baseBranch: 'main', addedAt: '2024-01-01' },
  { id: 'p2', name: 'Project B', path: '/b', baseBranch: 'main', addedAt: '2024-01-02' },
]

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    invoke: mockInvoke,
    on: mockOn,
  }
})

afterEach(() => {
  // Don't delete electronAPI — React may still call unsubscribe during unmount cleanup
})

import { useProjects } from './useProjects'

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

  describe('removeProject', () => {
    it('removes a project and clears active if it was active', async () => {
      const remaining = [sampleProjects[1]]
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(remaining)
        if (channel === 'projects:remove') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })
      // Override initial fetch to return full list
      mockInvoke.mockResolvedValueOnce(sampleProjects)

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.removeProject('p1')
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:remove', 'p1')
      // After removing the active project, the hook re-fetches and auto-selects the first remaining project
      await waitFor(() => {
        expect(result.current.activeProjectId).toBe('p2')
      })
    })

    it('keeps active project when removing a different one', async () => {
      const remaining = [sampleProjects[0]]
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(remaining)
        if (channel === 'projects:remove') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })
      // Override initial fetch to return full list
      mockInvoke.mockResolvedValueOnce(sampleProjects)

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.removeProject('p2')
      })

      expect(result.current.activeProjectId).toBe('p1')
    })
  })

  describe('updateProject', () => {
    it('invokes projects:update IPC and updates local state', async () => {
      const updatedProject = { ...sampleProjects[0], autoGenerateMessages: false }
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(sampleProjects)
        if (channel === 'projects:update') return Promise.resolve(updatedProject)
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('p1', { autoGenerateMessages: false })
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:update', 'p1', { autoGenerateMessages: false })
      expect(result.current.projects[0].autoGenerateMessages).toBe(false)
    })

    it('does not update state when IPC returns undefined', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(sampleProjects)
        if (channel === 'projects:update') return Promise.resolve(undefined)
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('unknown', { autoGenerateMessages: false })
      })

      expect(result.current.projects).toEqual(sampleProjects)
    })

    it('sets error when update fails', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'projects:list') return Promise.resolve(sampleProjects)
        if (channel === 'projects:update') return Promise.reject(new Error('update failed'))
        return Promise.resolve(undefined)
      })

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateProject('p1', { autoGenerateMessages: false })
      })

      expect(result.current.error).toBe('update failed')
    })
  })

  describe('setActiveProject', () => {
    it('changes the active project id', async () => {
      mockInvoke.mockResolvedValue(sampleProjects)

      const { result } = renderHook(() => useProjects())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      act(() => {
        result.current.setActiveProject('p2')
      })

      expect(result.current.activeProjectId).toBe('p2')
    })
  })
})
