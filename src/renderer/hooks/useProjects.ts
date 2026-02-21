import { useState, useEffect, useCallback } from 'react'
import type { Project } from '../../shared/types'

interface UseProjectsResult {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean
  error: string | null
  addProject: (path?: string) => Promise<void>
  cloneProject: (url: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  updateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => Promise<void>
  setActiveProject: (id: string) => void
}

export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('projects:list')) as Project[]
      setProjects(result)
      if (result.length > 0 && !activeProjectId) {
        setActiveProjectId(result[0].id)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [activeProjectId])

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  const addProject = useCallback(async (path?: string): Promise<void> => {
    try {
      let projectPath = path
      if (!projectPath) {
        projectPath = (await window.electronAPI.invoke('projects:open-dialog')) as string | undefined
        if (!projectPath) return
      }
      const project = (await window.electronAPI.invoke('projects:add', projectPath)) as Project
      setProjects((prev) => [...prev, project])
      setActiveProjectId(project.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [])

  const cloneProject = useCallback(async (url: string): Promise<void> => {
    try {
      const project = (await window.electronAPI.invoke('projects:clone', url)) as Project
      setProjects((prev) => [...prev, project])
      setActiveProjectId(project.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [])

  const removeProject = useCallback(async (id: string): Promise<void> => {
    try {
      await window.electronAPI.invoke('projects:remove', id)
      setProjects((prev) => prev.filter((p) => p.id !== id))
      setActiveProjectId((prev) => (prev === id ? null : prev))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [])

  const updateProject = useCallback(async (id: string, partial: Partial<Omit<Project, 'id'>>): Promise<void> => {
    try {
      const updated = (await window.electronAPI.invoke('projects:update', id, partial)) as Project | undefined
      if (updated) {
        setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    }
  }, [])

  const setActiveProject = useCallback((id: string): void => {
    setActiveProjectId(id)
  }, [])

  return {
    projects,
    activeProjectId,
    loading,
    error,
    addProject,
    cloneProject,
    removeProject,
    updateProject,
    setActiveProject,
  }
}
