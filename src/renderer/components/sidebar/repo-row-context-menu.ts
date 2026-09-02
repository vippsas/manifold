import type { MenuItem } from '../common/ContextMenu'

/** `/Users/me/projects/x` → `~/projects/x` when `/Users/me` is `homeDir` — the
 *  real home the preload captures once and exposes statically
 *  (`window.electronAPI.homeDir`), so `~` never claims someone else's home.
 *
 *  The match is exact and boundary-safe: `/Users/median/x` is not under
 *  `/Users/me`. A path outside home, or an absent home, comes back unchanged. */
export function tildePath(absolutePath: string, homeDir: string | undefined): string {
  const home = homeDir?.replace(/\/+$/, '')
  if (!home) return absolutePath
  if (absolutePath === home) return '~'
  if (absolutePath.startsWith(`${home}/`)) return `~${absolutePath.slice(home.length)}`
  return absolutePath
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
export function buildRepoRowContextMenu(
  folderPath: string | undefined,
  homeDir: string | undefined,
): MenuItem[] {
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
    { label: 'Copy Relative Path', action: copy(tildePath(folderPath, homeDir)) },
  ]
}
