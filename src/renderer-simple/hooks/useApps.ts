import { useState, useEffect, useCallback, useRef } from 'react'
import type { SimpleApp } from '../../shared/simple-types'
import type { AgentSession, Project } from '../../shared/types'

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
      const [sessions, projects, settings] = await Promise.all([
        window.electronAPI.invoke('agent:sessions') as Promise<AgentSession[]>,
        window.electronAPI.invoke('projects:list') as Promise<Project[]>,
        window.electronAPI.invoke('settings:get') as Promise<{ storagePath: string }>,
      ])
      const projectMap = new Map(projects.map((p) => [p.id, p]))
      // Only show apps whose project lives under the managed projects directory
      // (i.e. created from the simple view), not developer-view projects.
      const simpleProjectsBase = settings.storagePath + '/projects'
      const simpleSessions = sessions.filter((s) => {
        const projectPath = projectMap.get(s.projectId)?.path ?? ''
        return projectPath.startsWith(simpleProjectsBase)
      })
      const previewUrlEntries = await Promise.all(
        simpleSessions.map(async (session) => {
          const previewUrl = await window.electronAPI.invoke('simple:get-preview-url', session.id) as string | null
          return [session.id, previewUrl] as const
        }),
      )
      const previewUrlMap = new Map(previewUrlEntries)
      const simpleApps: SimpleApp[] = simpleSessions.map((s) => {
        const project = projectMap.get(s.projectId)
        return {
          previewUrl: previewUrlMap.get(s.id) ?? null,
          sessionId: s.id,
          projectId: s.projectId,
          runtimeId: s.runtimeId,
          branchName: s.branchName,
          name: project?.name ?? s.branchName.replace('manifold/', ''),
          description: s.taskDescription ?? '',
          simpleTemplateTitle: project?.simpleTemplateTitle ?? s.simpleTemplateTitle,
          simplePromptInstructions: project?.simplePromptInstructions ?? s.simplePromptInstructions,
          status:
            s.status === 'done' ? 'live'
            : s.status === 'error' ? 'error'
            : s.status === 'running' ? 'building'
            : s.status === 'waiting' && (previewUrlMap.get(s.id) ?? null) ? 'previewing'
            : 'idle',
          liveUrl: null,
          projectPath: project?.path ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
      })
      setApps(simpleApps)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshApps()
  }, [refreshApps])

  // Re-fetch app list whenever any agent's status changes so cards stay current.
  // Debounced to avoid hammering IPC on rapid-fire status events.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const unsub = window.electronAPI.on('agent:status', () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => refreshApps(), 500)
    })
    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [refreshApps])

  const deleteApp = useCallback(async (sessionId: string, projectId: string) => {
    await window.electronAPI.invoke('agent:delete-app', sessionId, projectId)
    await refreshApps()
  }, [refreshApps])

  return { apps, loading, refreshApps, deleteApp }
}
