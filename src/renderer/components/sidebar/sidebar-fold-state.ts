import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.openWorkspaces.v1'

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

/** Which workspace cards are open, remembered across launches. Any number at
 *  once — opening one never closes another (#902). `open` is idempotent and is
 *  what activation calls, so entering a workspace reveals it without shutting
 *  it when it was already showing. */
export function useWorkspaceFolds(): {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  open: (key: string) => void
} {
  const [openKeys, setOpenKeys] = useState<Set<string>>(readOpen)

  useEffect(() => {
    const sync = (): void => { setOpenKeys(new Set(readOpen())) }
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

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

  return { isOpen, toggle, open }
}
