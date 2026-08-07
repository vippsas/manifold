/**
 * The views the one left sidebar can show. The rail switches between them and
 * the sidebar shows exactly one at a time, like VS Code's view containers —
 * unlike the old model, where each of these was its own dock column and all
 * could be open at once (which is what left the sidebar cramped).
 *
 * The agent, the shell and the editor are deliberately absent: they are the
 * main area, not sidebar views.
 */
export const SIDEBAR_VIEW_IDS = ['explorer', 'sourceControl', 'search'] as const
export type SidebarViewId = (typeof SIDEBAR_VIEW_IDS)[number]

export const SIDEBAR_VIEW_TITLES: Record<SidebarViewId, string> = {
  explorer: 'Explorer',
  sourceControl: 'Source Control',
  search: 'Search',
}

export const DEFAULT_SIDEBAR_VIEW: SidebarViewId = 'explorer'
