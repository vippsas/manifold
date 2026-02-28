import { useState, useEffect, useCallback } from 'react'
import type { SimpleApp } from '../../shared/simple-types'

declare global {
  interface Window {
    electronAPI: {
      invoke(channel: string, ...args: unknown[]): Promise<unknown>
      send(channel: string, ...args: unknown[]): void
      on(channel: string, callback: (...args: unknown[]) => void): () => void
    }
  }
}

export function useApps(): {
  apps: SimpleApp[]
  loading: boolean
  refreshApps: () => Promise<void>
  deleteApp: (sessionId: string, projectId: string) => Promise<void>
} {
  const [apps, setApps] = useState<SimpleApp[]>([])
  const [loading, setLoading] = useState(true)

  const refreshApps = useCallback(async () => {
    setLoading(true)
    try {
      const [sessions, projects] = await Promise.all([
        window.electronAPI.invoke('agent:sessions') as Promise<Array<{
          id: string
          projectId: string
          branchName: string
          status: string
          taskDescription?: string
        }>>,
        window.electronAPI.invoke('projects:list') as Promise<Array<{
          id: string
          name: string
          path: string
        }>>,
      ])
      const projectMap = new Map(projects.map((p) => [p.id, p]))
      const simpleApps: SimpleApp[] = sessions.map((s) => ({
        sessionId: s.id,
        projectId: s.projectId,
        name: projectMap.get(s.projectId)?.name ?? s.branchName.replace('manifold/', ''),
        description: s.taskDescription ?? '',
        status:
          s.status === 'done' ? 'live'
          : s.status === 'error' ? 'error'
          : s.status === 'running' ? 'building'
          : s.status === 'waiting' ? 'previewing'
          : 'idle',
        previewUrl: null,
        liveUrl: null,
        projectPath: projectMap.get(s.projectId)?.path ?? '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
      setApps(simpleApps)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshApps()
  }, [refreshApps])

  const deleteApp = useCallback(async (sessionId: string, projectId: string) => {
    await window.electronAPI.invoke('agent:delete-app', sessionId, projectId)
    await refreshApps()
  }, [refreshApps])

  return { apps, loading, refreshApps, deleteApp }
}
