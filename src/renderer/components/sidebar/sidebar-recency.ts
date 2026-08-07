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
 * Last-accessed timestamps per sidebar root (a workspace), persisted to
 * localStorage, ordering the sidebar most-recent-first.
 *
 * The order is read once and then held for the life of the list: a touch is
 * recorded for the next launch but must not re-sort the rows you are working
 * in. Re-sorting live meant that picking an agent slid its repo to the top,
 * moving every other row under the cursor mid-click — which made going back and
 * forth between two repos a chase.
 */
export function useProjectRecency(): {
  recency: ProjectRecency
  touchProject: (projectId: string) => void
} {
  const [recency] = useState<ProjectRecency>(readRecency)

  const touchProject = useCallback((projectId: string) => {
    const next = pruneRecency({ ...readRecency(), [projectId]: Date.now() })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage can be unavailable in restricted renderer contexts; the current
      // ordering still stands, there is just nothing to restore next launch.
    }
  }, [])

  return { recency, touchProject }
}

/** The active project first — where you are working is always at the top of the
 *  list, in the one place you can find without reading it — then most recently
 *  accessed; never-accessed projects keep their incoming (alphabetical) order
 *  after the accessed ones. */
export function sortByRecency<T extends { id: string }>(
  projects: readonly T[],
  recency: ProjectRecency,
  activeId?: string | null,
): T[] {
  return [...projects].sort((left, right) => {
    if (left.id === activeId) return -1
    if (right.id === activeId) return 1
    return (recency[right.id] ?? 0) - (recency[left.id] ?? 0)
  })
}
