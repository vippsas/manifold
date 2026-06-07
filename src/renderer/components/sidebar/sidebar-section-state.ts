import { useCallback, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.sections.v1'

export type SidebarSectionKey = 'favorites' | 'workspaces' | 'withAgents' | 'repositories'

type SidebarSectionState = Partial<Record<SidebarSectionKey, boolean>>

function readSectionState(): SidebarSectionState {
  if (typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    const state: SidebarSectionState = {}
    for (const key of ['favorites', 'workspaces', 'withAgents', 'repositories'] satisfies SidebarSectionKey[]) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === 'boolean') state[key] = value
    }
    return state
  } catch {
    return {}
  }
}

function writeSectionState(key: SidebarSectionKey, expanded: boolean): void {
  if (typeof localStorage === 'undefined') return

  try {
    const state = readSectionState()
    state[key] = expanded
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable in restricted renderer contexts. In that case
    // keep the in-memory toggle working and skip persistence.
  }
}

export function useSidebarSectionState(
  key: SidebarSectionKey,
  defaultExpanded: boolean,
): [boolean, () => void] {
  const [expanded, setExpanded] = useState(() => readSectionState()[key] ?? defaultExpanded)

  const toggleExpanded = useCallback(() => {
    setExpanded((current) => {
      const next = !current
      writeSectionState(key, next)
      return next
    })
  }, [key])

  return [expanded, toggleExpanded]
}
