import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.openFolders.v1'

/** Identifies a folder in the sidebar: a repo's checkout, or an agent's worktree. */
export function projectFolderKey(projectId: string): string {
  return `project:${projectId}`
}

export function worktreeFolderKey(sessionId: string): string {
  return `session:${sessionId}`
}

/** Every mounted copy of the hook works on one set: the standalone repo list and
 *  the workspace cards are separate components, and two copies would each save
 *  their own snapshot — the later toggle dropping folders the other had opened. */
const listeners = new Set<() => void>()

/** Holds the set once storage has proved unusable, and is authoritative from
 *  then on so the toggles keep working without persistence. */
let unstoredFolders: Set<string> | null = null

function readOpenFolders(): Set<string> {
  if (unstoredFolders) return unstoredFolders
  if (typeof localStorage === 'undefined') return (unstoredFolders = new Set())

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((key): key is string => typeof key === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function writeOpenFolders(keys: Set<string>): void {
  // Storage can be unavailable in restricted renderer contexts. In that case
  // keep the toggles working in memory and skip persistence.
  if (typeof localStorage === 'undefined') {
    unstoredFolders = keys
    return
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    unstoredFolders = keys
  }
}

/** Which folders are showing their files, remembered across launches.
 *
 *  Any number at once, like the folders of a VS Code workspace: opening one
 *  never closes another, and a file in any of them can be opened without first
 *  selecting its repo. */
export function useFolderDisclosure(): {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
} {
  const [openKeys, setOpenKeys] = useState<Set<string>>(readOpenFolders)

  useEffect(() => {
    const sync = (): void => { setOpenKeys(readOpenFolders()) }
    listeners.add(sync)
    return () => { listeners.delete(sync) }
  }, [])

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

  const toggle = useCallback((key: string): void => {
    const next = new Set(readOpenFolders())
    if (!next.delete(key)) next.add(key)
    writeOpenFolders(next)
    for (const listener of listeners) listener()
  }, [])

  return { isOpen, toggle }
}
