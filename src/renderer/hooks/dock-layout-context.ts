import type { MutableRefObject } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'
import type { DockPanelId, LayoutRefs } from './dock-layout-helpers'

/**
 * Shared mutable state and callbacks threaded through the useDockLayout
 * sub-modules (tabs, editor panels, actions, lifecycle). Assembled once in
 * useDockLayout and kept referentially stable so the sub-hooks' callbacks
 * don't churn between renders.
 */
export interface DockLayoutCtx {
  apiRef: MutableRefObject<DockviewApi | null>
  sessionIdRef: MutableRefObject<string | null>
  showIdeasTabRef: MutableRefObject<boolean>
  showLoopTabRef: MutableRefObject<boolean>
  showVerdictsTabRef: MutableRefObject<boolean>
  showWatchTabRef: MutableRefObject<boolean>
  editorPanelIdsRef: MutableRefObject<Set<string>>
  nextEditorPanelIndexRef: MutableRefObject<number>
  closedPanelSnapshots: MutableRefObject<Map<DockPanelId, SerializedDockview>>
  sidebarWidthsRef: MutableRefObject<{ left: number; right: number }>
  lastLayoutRef: MutableRefObject<SerializedDockview | null>
  refs: LayoutRefs
  saveLayout: () => void
  syncPanels: (api: DockviewApi) => void
  bumpVersion: () => void
  bumpReloadVersion: () => void
}
