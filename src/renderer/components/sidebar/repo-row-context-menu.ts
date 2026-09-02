import type { MenuItem } from '../common/ContextMenu'

/** `/Users/me/projects/x` → `~/projects/x`, for the row's "Copy Relative Path".
 *
 *  The renderer cannot ask `os.homedir()` (contextIsolation, no node), and no
 *  preload channel carries it, so this recognises the two conventional home
 *  roots by shape instead. A path under nobody's home comes back unchanged. */
export function tildePath(absolutePath: string): string {
  const home = /^\/(?:Users|home)\/[^/]+(?=\/|$)/.exec(absolutePath)
  if (!home) return absolutePath
  return `~${absolutePath.slice(home[0].length)}`
}

/**
 * What right-clicking a workspace folder row offers: the folder's path, two
 * ways. The card above owns the workspace-wide actions; this menu only says
 * where this one folder is.
 *
 * With no known path (a row whose repo is gone and whose workspace made no
 * worktree for it) the items stay visible but disabled — copying the literal
 * projectId would only look like a path.
 */
export function buildRepoRowContextMenu(folderPath: string | undefined): MenuItem[] {
  const copy = (text: string) => (): void => {
    void navigator.clipboard.writeText(text)
  }
  if (!folderPath) {
    const noop = (): void => {}
    return [
      { label: 'Copy Path', action: noop, disabled: true },
      { label: 'Copy Relative Path', action: noop, disabled: true },
    ]
  }
  return [
    { label: 'Copy Path', action: copy(folderPath) },
    { label: 'Copy Relative Path', action: copy(tildePath(folderPath)) },
  ]
}
