// The dock's vocabulary: which panes exist, what they are called, where each
// one opens, and the shape of a serialized grid. No dockview API calls live
// here — everything is a constant or a pure reader, so every other dock-layout
// module can depend on this one without a cycle.
import type { SerializedDockview } from 'dockview'

export const PANEL_IDS = ['sidebar', 'agent', 'editor', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]
export const EDITOR_PANEL_ID_PREFIX = 'editor:'
export type EditorSplitDirection = 'right' | 'below'

export const PANEL_TITLES: Record<DockPanelId, string> = {
  sidebar: 'Sidebar',
  agent: 'Agent',
  editor: 'Editor',
  shell: 'Shell',
}

export type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

/** Where a pane opens. `ref: null` means "relative to the dock root" rather
 *  than to another pane — dockview re-roots the grid along that axis first. */
export interface RestoreHint {
  ref: DockPanelId | null
  dir: Direction
}

// Every pane has one home, tried in order against whatever is currently open.
// The sidebar anchors to the dock root, not to the agent: removing a pane can
// leave dockview's root orientation vertical (it promotes a lone child branch
// to the root), and a sidebar anchored to the agent then reopens as a cell in
// the top row instead of a full-height column. The root-relative add flips the
// root back. The shell opens below the agent and is then widened to span the
// whole workspace row by `spanShellAcrossWorkspace`.
export const PANEL_RESTORE_HINTS: Record<DockPanelId, RestoreHint[]> = {
  sidebar: [{ ref: null, dir: 'left' }],
  agent: [{ ref: 'sidebar', dir: 'right' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
}

/** The anchor panel of the one sidebar (protected from resize redistribution). */
export const SIDEBAR_PANEL_IDS = new Set<string>(['sidebar'])

export interface LayoutRefs {
  isRestoringRef: React.MutableRefObject<boolean>
  lastLayoutRef: React.MutableRefObject<SerializedDockview | null>
}

export function isEditorPanelId(panelId: string): boolean {
  return panelId === 'editor' || panelId.startsWith(EDITOR_PANEL_ID_PREFIX)
}

export function parseEditorPanelOrder(panelId: string): number {
  if (panelId === 'editor') return 0
  const suffix = Number(panelId.slice(EDITOR_PANEL_ID_PREFIX.length))
  return Number.isFinite(suffix) ? suffix : Number.MAX_SAFE_INTEGER
}

// ── Serialized layout tree ──────────────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

export type GridNode =
  | { type: 'branch'; data: GridNode[]; size: number }
  | { type: 'leaf'; data: { views: string[]; id: string; activeView?: string }; size: number }

/**
 * Produce a string that captures the grid's panel arrangement (which panels
 * live in which groups, how groups are nested) but ignores sizes.  Two layouts
 * with the same signature differ only in panel/group dimensions — any panel
 * add, remove, or drag-to-new-group changes the signature.
 */
function nodeSignature(node: GridNode): string {
  if (node.type === 'leaf') return `L[${[...node.data.views].sort().join(',')}]`
  return `B[${node.data.map(nodeSignature).join('|')}]`
}

export function getGridSignature(layout: SerializedDockview): string {
  return nodeSignature(layout.grid.root as GridNode)
}
