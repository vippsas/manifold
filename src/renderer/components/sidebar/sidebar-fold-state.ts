import { useCallback, useEffect, useState } from 'react'

// v2: the group fold moved from the home workspace's key onto the repo
// header's own `repo:<projectId>` key, so v1 entries would name folds that no
// longer exist. A fresh key starts everyone collapsed rather than half-migrated.
const STORAGE_KEY = 'manifold.sidebar.openWorkspaces.v2'

/** A workspace card. A home card's key also folds the worktrees under its repo. */
export function workspaceFoldKey(workspaceId: string): string {
  return `workspace:${workspaceId}`
}

/** A repo that has worktree workspaces but no home workspace to head them. */
export function repoFoldKey(projectId: string): string {
  return `repo:${projectId}`
}

/** Every mounted copy of the hook works on one set — the list and each group
 *  read it — so a toggle anywhere is seen everywhere. */
const listeners = new Set<() => void>()

/** Holds the set once storage has proved unusable, and is authoritative from
 *  then on so the toggles keep working without persistence. */
let unstored: Set<string> | null = null

function readOpen(): Set<string> {
  if (unstored) return unstored
  if (typeof localStorage === 'undefined') return (unstored = new Set())
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((key): key is string => typeof key === 'string'))
      : new Set()
  } catch {
    return (unstored = new Set())
  }
}

function commit(next: Set<string>): void {
  if (unstored) {
    unstored = next
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      unstored = next
    }
  }
  for (const listener of listeners) listener()
}

/** For tests only: reset the module-level unstored state to avoid test-order
 *  dependencies. Tests must call this in beforeEach. */
export function __resetFoldStateForTests(): void {
  unstored = null
}

/** Which workspace cards are open, remembered across launches. Any number at
 *  once — opening one never closes another (#902). `open` is idempotent and is
 *  what activation calls, so entering a workspace reveals it without shutting
 *  it when it was already showing. */
export function useWorkspaceFolds(): {
  isOpen: (key: string) => boolean
  isGroupOpen: (key: string) => boolean
  toggle: (key: string) => void
  open: (key: string) => void
  openGroup: (key: string) => void
} {
  const [openKeys, setOpenKeys] = useState<Set<string>>(readOpen)

  useEffect(() => {
    const sync = (): void => { setOpenKeys(new Set(readOpen())) }
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

  /** A **repo group** defaults to open, so a repo never hides its own
   *  workspaces until you say so — the store records the groups you closed,
   *  the inverse of how it records the cards you opened. Card state stays on
   *  `isOpen`; only the group fold reads this. */
  const isGroupOpen = useCallback((key: string): boolean => !openKeys.has(key), [openKeys])

  const toggle = useCallback((key: string): void => {
    const next = new Set(readOpen())
    if (!next.delete(key)) next.add(key)
    commit(next)
  }, [])

  const open = useCallback((key: string): void => {
    const current = readOpen()
    if (current.has(key)) return
    commit(new Set(current).add(key))
  }, [])

  /** Reveals a group whatever its stored state — the inverse of `open`, since
   *  a group's presence in the set means *closed*. */
  const openGroup = useCallback((key: string): void => {
    const current = readOpen()
    if (!current.has(key)) return
    const next = new Set(current)
    next.delete(key)
    commit(next)
  }, [])

  return { isOpen, isGroupOpen, toggle, open, openGroup }
}
