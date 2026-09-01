import React from 'react'
import { createPortal } from 'react-dom'
import { describeShellFolder, type ShellFolder } from './shell-cwd'
import { shellTabStyles as styles } from './ShellTabs.styles'

/** Where to hang the menu, in viewport coordinates. Anchored by whichever edge
 *  the caller's control sits near: the dock header's `+` is at the far right,
 *  where a left-anchored menu would hang off the window; the panel's empty-state
 *  button is mid-body. */
export type ShellFolderMenuAnchor =
  | { top: number; left: number }
  | { top: number; right: number }

interface ShellFolderMenuProps {
  folders: ShellFolder[]
  anchor: ShellFolderMenuAnchor
  onPick: (folder: ShellFolder) => void
  onClose: () => void
}

/** Which folder of a multi-folder workspace a new terminal should run in.
 *
 *  Only ever shown when there is a real choice — a workspace of one folder
 *  opens its terminal without asking, as VS Code does ("Only choose a path when
 *  there's more than 1 folder", `terminalActions.ts:104`). Dismissing it opens
 *  nothing, also matching VS Code: a cancelled pick creates no terminal.
 *
 *  Each row is the folder's name over the part of its path that distinguishes
 *  it from the others (`describeShellFolder`), so the shared home prefix never
 *  takes up the width that tells two worktrees of one repo apart. The absolute
 *  path stays on the row's tooltip. */
export function ShellFolderMenu({ folders, anchor, onPick, onClose }: ShellFolderMenuProps): React.JSX.Element {
  const menuRef = React.useRef<HTMLDivElement>(null)
  const description = (folder: ShellFolder): string | undefined => describeShellFolder(folder, folders)

  React.useEffect(() => {
    const handleMouseDown = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    // Deferred: the click that opened this menu is still propagating, and would
    // otherwise close it on the same tick.
    const timer = window.setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown)
    }, 0)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label="Select current working directory for new terminal"
      style={{ ...styles.shellTypeMenu, ...styles.folderMenu, ...anchor }}
    >
      {folders.map((folder) => (
        <button
          key={folder.projectId}
          type="button"
          role="menuitem"
          style={styles.folderMenuItem}
          title={folder.path}
          onClick={() => onPick(folder)}
        >
          <span style={styles.folderMenuName}>{folder.name}</span>
          {description(folder) && (
            <span style={styles.folderMenuPath}>{description(folder)}</span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  )
}
