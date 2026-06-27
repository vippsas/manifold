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

describe('useProjects — mutations', () => {
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
      const updatedProject = { ...sampleProjects[0], baseBranch: 'develop' }
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
        await result.current.updateProject('p1', { baseBranch: 'develop' })
      })

      expect(mockInvoke).toHaveBeenCalledWith('projects:update', 'p1', { baseBranch: 'develop' })
      expect(result.current.projects[0].baseBranch).toBe('develop')
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
        await result.current.updateProject('unknown', { baseBranch: 'develop' })
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
        await result.current.updateProject('p1', { baseBranch: 'develop' })
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

      await act(async () => {
        result.current.setActiveProject('p2')
      })

      await waitFor(() => {
        expect(result.current.activeProjectId).toBe('p2')
        expect(result.current.loading).toBe(false)
      })
    })
  })
})
