import type { DockviewApi, SerializedDockview } from 'dockview'
import type { DockPanelId } from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * A DockLayoutCtx wired the way useDockLayout wires it, for tests that drive the
 * real listeners (registerLayoutListeners) against a real dockview instead of
 * rendering the whole hook. Callbacks are inert: these tests assert on widths
 * and on the refs, not on saves or re-renders.
 */
export function makeTestDockLayoutCtx(api: DockviewApi): DockLayoutCtx {
  const isRestoringRef = { current: false }
  const lastLayoutRef: { current: SerializedDockview | null } = { current: null }
  return {
    apiRef: { current: api },
    editorPanelIdsRef: { current: new Set<string>() },
    nextEditorPanelIndexRef: { current: 1 },
    closedPanelSnapshots: { current: new Map<DockPanelId, SerializedDockview>() },
    sidebarWidthRef: { current: 0 },
    dockWidthRef: { current: 0 },
    dockResizeObserverRef: { current: null },
    lastLayoutRef,
    refs: { isRestoringRef, lastLayoutRef },
    saveLayout: () => {},
    syncPanels: () => {},
    bumpVersion: () => {},
    bumpReloadVersion: () => {},
  }
}
