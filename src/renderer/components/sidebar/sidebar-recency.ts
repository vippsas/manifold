import { useCallback, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.recency.v1'
const MAX_ENTRIES = 50

export type ProjectRecency = Record<string, number>

function readRecency(): ProjectRecency {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const recency: ProjectRecency = {}
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) recency[id] = value
    }
    return recency
  } catch {
    return {}
  }
}

function pruneRecency(recency: ProjectRecency): ProjectRecency {
  const entries = Object.entries(recency)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_ENTRIES)
  return Object.fromEntries(entries)
}

/**
 * Last-accessed timestamps per project, persisted to localStorage. Drives the
 * ordering of the "With agents" sidebar section: items move to the top when
 * accessed and otherwise hold their position, instead of the whole list
 * reshuffling around the active project.
 */
export function useProjectRecency(): {
  recency: ProjectRecency
  touchProject: (projectId: string) => void
} {
  const [recency, setRecency] = useState<ProjectRecency>(readRecency)

  const touchProject = useCallback((projectId: string) => {
    setRecency((current) => {
      const next = pruneRecency({ ...current, [projectId]: Date.now() })
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Storage can be unavailable in restricted renderer contexts. In that
        // case keep the in-memory ordering working and skip persistence.
      }
      return next
    })
  }, [])

  return { recency, touchProject }
}

/** Most recently accessed first; never-accessed projects keep their incoming
 *  (alphabetical) order after the accessed ones. */
export function sortByRecency<T extends { id: string }>(
  projects: readonly T[],
  recency: ProjectRecency,
): T[] {
  return [...projects].sort((left, right) => (recency[right.id] ?? 0) - (recency[left.id] ?? 0))
}
