import { useState, useEffect, useRef, useCallback } from 'react'
import type { Project } from '../../shared/types'
import { isGitProject } from '../../shared/project-kind'

const STALENESS_THROTTLE_MS = 3 * 60 * 1000

interface UseBranchStalenessResult {
  behindCounts: Record<string, number>
  markFresh: (projectId: string) => void
}

/**
 * Tracks how many commits the active project's base branch is behind origin,
 * via a read-only background probe (git:staleness) on launch and window focus,
 * throttled per project. Only the active project has a refresh button, so only
 * the active project is probed. Probe failures never surface in the UI.
 */
export function useBranchStaleness(
  activeProjectId: string | null,
  projects: Project[],
): UseBranchStalenessResult {
  const [behindCounts, setBehindCounts] = useState<Record<string, number>>({})
  const lastCheckedRef = useRef<Record<string, number>>({})
  const projectsRef = useRef(projects)
  projectsRef.current = projects

  const probe = useCallback(async (projectId: string): Promise<void> => {
    const project = projectsRef.current.find((p) => p.id === projectId)
    if (!project || !isGitProject(project)) return
    const now = Date.now()
    if (now - (lastCheckedRef.current[projectId] ?? 0) < STALENESS_THROTTLE_MS) return
    lastCheckedRef.current[projectId] = now
    try {
      const result = await window.electronAPI.invoke('git:staleness', projectId) as { behindCount: number }
      setBehindCounts((prev) => ({ ...prev, [projectId]: result.behindCount }))
    } catch {
      // Background probe: never surface failures in the UI.
    }
  }, [])

  // Probe on launch and whenever the active project changes.
  useEffect(() => {
    if (activeProjectId) void probe(activeProjectId)
  }, [activeProjectId, probe])

  // Re-probe the active project when the window regains focus (throttled inside probe).
  useEffect(() => {
    const onFocus = (): void => { if (activeProjectId) void probe(activeProjectId) }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [activeProjectId, probe])

  const markFresh = useCallback((projectId: string): void => {
    lastCheckedRef.current[projectId] = Date.now()
    setBehindCounts((prev) => ({ ...prev, [projectId]: 0 }))
  }, [])

  return { behindCounts, markFresh }
}
