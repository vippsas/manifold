import { useState, useEffect, useCallback } from 'react'
import type { CreateProjectOptions, Project } from '../../shared/types'
import { sortProjectsByName } from '../../shared/project-sort'

interface UseProjectsResult {
  projects: Project[]
  activeProjectId: string | null
  loading: boolean
  error: string | null
  addProject: (path?: string, options?: { activate?: boolean }) => Promise<Project | null>
  cloneProject: (url: string) => Promise<boolean>
  createNewProject: (options: CreateProjectOptions) => Promise<Project | null>
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
      const sorted = sortProjectsByName(result)
      setProjects(sorted)
      if (sorted.length > 0 && !activeProjectId) {
        setActiveProjectId(sorted[0].id)
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

  const addProject = useCallback(async (
    path?: string,
    options?: { activate?: boolean },
  ): Promise<Project | null> => {
    setError(null)
    try {
      let projectPath = path
      if (!projectPath) {
        projectPath = (await window.electronAPI.invoke('projects:open-dialog')) as string | undefined
        if (!projectPath) return null
      }
      const project = (await window.electronAPI.invoke('projects:add', projectPath)) as Project
      setProjects((prev) => sortProjectsByName([...prev, project]))
      if (options?.activate !== false) {
        setActiveProjectId(project.id)
      }
      return project
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    }
  }, [])

  const createNewProject = useCallback(async (options: CreateProjectOptions): Promise<Project | null> => {
    setError(null)
    try {
      let targetDir = options.targetDir
      if (!targetDir && options.projectKind !== 'folder') {
        targetDir = (await window.electronAPI.invoke('projects:create-new-dialog', options.description)) as string | undefined
        if (!targetDir) return null
      }
      const payload = targetDir ? { ...options, targetDir } : options
      const project = (await window.electronAPI.invoke('projects:create-new', payload)) as Project
      setProjects((prev) => sortProjectsByName([...prev, project]))
      setActiveProjectId(project.id)
      return project
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return null
    }
  }, [])

  const cloneProject = useCallback(async (url: string): Promise<boolean> => {
    setError(null)
    try {
      const targetDir = (await window.electronAPI.invoke('projects:clone-dialog', url)) as string | undefined
      if (!targetDir) return false // user cancelled
      const project = (await window.electronAPI.invoke('projects:clone', url, targetDir)) as Project | undefined
      if (!project) return false
      setProjects((prev) => sortProjectsByName([...prev, project]))
      setActiveProjectId(project.id)
      return true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      return false
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
        setProjects((prev) => sortProjectsByName(prev.map((p) => (p.id === id ? updated : p))))
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
    createNewProject,
    removeProject,
    updateProject,
    setActiveProject,
  }
}
