import { useCallback, useState } from 'react'

const STORAGE_KEY = 'manifold.sidebar.openFolders.v1'

/** Identifies a folder in the sidebar: a repo's checkout, or an agent's worktree. */
export function projectFolderKey(projectId: string): string {
  return `project:${projectId}`
}

export function worktreeFolderKey(sessionId: string): string {
  return `session:${sessionId}`
}

function readOpenFolders(): Set<string> {
  if (typeof localStorage === 'undefined') return new Set()

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
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]))
  } catch {
    // Storage can be unavailable in restricted renderer contexts. In that case
    // keep the in-memory toggles working and skip persistence.
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

  const isOpen = useCallback((key: string): boolean => openKeys.has(key), [openKeys])

  const toggle = useCallback((key: string): void => {
    setOpenKeys((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      writeOpenFolders(next)
      return next
    })
  }, [])

  return { isOpen, toggle }
}
