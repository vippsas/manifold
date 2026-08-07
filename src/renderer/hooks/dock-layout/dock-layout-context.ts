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
  editorPanelIdsRef: MutableRefObject<Set<string>>
  nextEditorPanelIndexRef: MutableRefObject<number>
  closedPanelSnapshots: MutableRefObject<Map<DockPanelId, SerializedDockview>>
  sidebarWidthRef: MutableRefObject<number>
  /** The dock's own width as of the last time the sidebar width was reconciled,
   *  so a resize that has already been handled is not handled twice. */
  dockWidthRef: MutableRefObject<number>
  /** Observer re-pinning the sidebar after the dock is resized, attached lazily
   *  once dockview has rendered a group to hang it off. */
  dockResizeObserverRef: MutableRefObject<ResizeObserver | null>
  lastLayoutRef: MutableRefObject<SerializedDockview | null>
  refs: LayoutRefs
  saveLayout: () => void
  syncPanels: (api: DockviewApi) => void
  bumpVersion: () => void
  bumpReloadVersion: () => void
}
