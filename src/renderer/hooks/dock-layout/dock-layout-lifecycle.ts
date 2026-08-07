import type { DockviewApi } from 'dockview'
import {
  PANEL_IDS,
  getGridSignature,
  getSidebarWidth,
  restoreSidebarWidth,
  isEditorPanelId,
  type DockPanelId,
} from './dock-layout-helpers'
import type { DockLayoutCtx } from './dock-layout-context'

/**
 * Hold the sidebar at the pixel width the user chose after the dock has been
 * laid out at a new size, pushing the whole delta onto the center pane — the way
 * VS Code holds the side bar's width and gives a wider window's slack to the
 * editor.
 *
 * dockview instead lays the grid out proportionally, so every column scales and
 * the sidebar creeps wider on a wider window. There is no way to opt out:
 * `proportionalLayout` is hardcoded `true` (`dockviewComponent.js:117`) and
 * dockview's own source marks the option "not supported"
 * (`baseComponentGridview.js:192`).
 *
 * Must be called *after* dockview has relaid out at the new size — see
 * observeDockResize for why that ordering cannot simply be assumed.
 */
export function restoreSidebarWidthAfterResize(api: DockviewApi, ctx: DockLayoutCtx): void {
  if (ctx.refs.isRestoringRef.current) return
  // A maximized group hides the sidebar, so its width reads 0; the pinned width
  // is restored when maximize is exited.
  if (api.hasMaximizedGroup()) return
  if (ctx.sidebarWidthRef.current <= 0) return
  if (api.width <= 0 || api.width === ctx.dockWidthRef.current) return

  ctx.dockWidthRef.current = api.width
  restoreSidebarWidth(api, ctx.sidebarWidthRef.current, ctx.refs)
  ctx.saveLayout()
}

/**
 * Watch the dock element for size changes and re-pin the sidebar after each one.
 *
 * A window resize reaches the grid as a bare `BranchNode.layout()`, which emits
 * nothing — `onDidLayoutChange` never fires for it, so this cannot live in that
 * listener. Nor can the re-pin be scheduled off the window's `resize` event:
 * dockview defers its own relayout by a frame (`watchElementResize` in `dom.js`
 * wraps its ResizeObserver callback in requestAnimationFrame), and measurements
 * against the built app showed every timer-based guess — setTimeout,
 * requestAnimationFrame, and a task queued from inside one — still reading the
 * dock one resize behind.
 *
 * Observing the same element removes the guessing. ResizeObserver callbacks are
 * delivered in observer-registration order, and dockview registered its observer
 * when the component was constructed, before this one; its frame callback is
 * therefore queued first, so by the time this one runs the relayout has happened.
 */
export function observeDockResize(api: DockviewApi, ctx: DockLayoutCtx): ResizeObserver | null {
  const root = api.groups[0]?.element.closest('.dv-dockview')
  if (!(root instanceof HTMLElement)) return null

  const observer = new ResizeObserver(() => {
    requestAnimationFrame(() => restoreSidebarWidthAfterResize(api, ctx))
  })
  observer.observe(root)
  return observer
}

/**
 * Register the dockview panel-removal and layout-change listeners that keep
 * useDockLayout's bookkeeping (editor panel ids, closed-panel snapshots,
 * pinned sidebar widths) in sync. Extracted verbatim from onReady.
 */
export function registerLayoutListeners(api: DockviewApi, ctx: DockLayoutCtx): void {
  ctx.dockWidthRef.current = api.width

  api.onDidRemovePanel((panel) => {
    if (ctx.refs.isRestoringRef.current) return

    if (isEditorPanelId(panel.id)) {
      ctx.editorPanelIdsRef.current.delete(panel.id)
      ctx.bumpVersion()
      return
    }

    const id = panel.id as DockPanelId
    if (PANEL_IDS.includes(id) && ctx.lastLayoutRef.current) {
      ctx.closedPanelSnapshots.current.set(id, ctx.lastLayoutRef.current)
    }
  })

  api.onDidLayoutChange(() => {
    if (ctx.refs.isRestoringRef.current) return

    // The dock element only exists once dockview has groups, so the resize
    // observer is attached on the first layout change rather than up front.
    if (!ctx.dockResizeObserverRef.current) {
      ctx.dockResizeObserverRef.current = observeDockResize(api, ctx)
    }

    // While a group is maximized (double-click focus mode), every other group —
    // the sidebar included — is hidden, so its offsetWidth reads 0. Skip the
    // sidebar-width bookkeeping and layout save until maximize is exited, so
    // the captured width and persisted layout stay at their pre-maximize values
    // and restore exactly on exit.
    if (api.hasMaximizedGroup()) return

    const previousJson = ctx.lastLayoutRef.current
    const currentJson = api.toJSON()

    // Detect structural changes (panel moves/adds/removes) vs simple
    // divider resizes by comparing the grid's panel arrangement.
    const structureChanged = previousJson &&
      getGridSignature(previousJson) !== getGridSignature(currentJson)

    ctx.dockWidthRef.current = api.width

    if (structureChanged && ctx.sidebarWidthRef.current > 0) {
      // Structural change — restore the pinned sidebar width so only the
      // center (agent) pane absorbs the size difference.
      restoreSidebarWidth(api, ctx.sidebarWidthRef.current, ctx.refs)
    } else {
      // Pure resize (user dragging a divider) — update the pinned width.
      ctx.sidebarWidthRef.current = getSidebarWidth(api)
      ctx.lastLayoutRef.current = currentJson
    }

    ctx.syncPanels(api)
    ctx.saveLayout()
    ctx.bumpVersion()
  })
}
