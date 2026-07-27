import { useCallback } from 'react'
import { getGridLocation, type Orientation } from 'dockview-core'
import {
  applyLayoutChangePreservingSidebarWidths,
  PANEL_TITLES,
  findAdjacentEditorPanelId,
  getSidebarWidths,
  parseEditorPanelOrder,
  showPanelFromHints,
  widenSharedEditorGroup,
  type EditorSplitDirection,
} from './dock-layout-helpers'
import { ensureEditorPanelInWorkspace } from './dock-layout-editor'
import type { DockLayoutCtx } from './dock-layout-context'

export interface EditorPanelHandlers {
  ensureEditorPanel: (preferredPanelId?: string | null) => string
  splitEditorPane: (referencePanelId: string, direction: EditorSplitDirection) => string | null
  findEditorPanelForSplit: (referencePanelId: string, direction: EditorSplitDirection) => string | null
}

/** Editor-panel operations extracted from useDockLayout. */
export function useEditorPanels(ctx: DockLayoutCtx, focusPanel: (id: string) => void): EditorPanelHandlers {
  const { saveLayout, syncPanels, bumpVersion, refs } = ctx

  const ensureEditorPanel = useCallback((preferredPanelId?: string | null): string => {
    const api = ctx.apiRef.current
    if (!api) return preferredPanelId ?? 'editor'

    let layoutChanged = false
    applyLayoutChangePreservingSidebarWidths(api, () => {
      layoutChanged = ensureEditorPanelInWorkspace(api)
    }, refs)
    if (layoutChanged) {
      // When the editor tabbed into the files sidebar group, widen the shared
      // group to an editable width — outside the pinning scope above, which
      // holds the sidebar at its pre-change width.
      widenSharedEditorGroup(api, refs)
      syncPanels(api)
      ctx.sidebarWidthsRef.current = getSidebarWidths(api)
    }

    const visibleEditorPanels = Array.from(ctx.editorPanelIdsRef.current).sort((left, right) => (
      parseEditorPanelOrder(left) - parseEditorPanelOrder(right)
    ))

    const existingPanelId = preferredPanelId && visibleEditorPanels.includes(preferredPanelId)
      ? preferredPanelId
      : visibleEditorPanels[0]

    if (existingPanelId) {
      if (layoutChanged) {
        ctx.lastLayoutRef.current = api.toJSON()
        saveLayout()
        bumpVersion()
      }
      focusPanel(existingPanelId)
      return existingPanelId
    }

    showPanelFromHints(api, 'editor', refs)
    syncPanels(api)
    layoutChanged = true
    saveLayout()
    bumpVersion()
    focusPanel('editor')
    return 'editor'
  }, [ctx, bumpVersion, focusPanel, saveLayout, syncPanels, refs])

  const splitEditorPane = useCallback((referencePanelId: string, direction: EditorSplitDirection): string | null => {
    const api = ctx.apiRef.current
    if (!api) return null

    const referencePanel = api.getPanel(referencePanelId) ?? api.getPanel(ensureEditorPanel(referencePanelId))
    if (!referencePanel) return null

    const newPanelId = `${PANEL_TITLES.editor.toLowerCase()}:${ctx.nextEditorPanelIndexRef.current}`
    ctx.nextEditorPanelIndexRef.current += 1

    applyLayoutChangePreservingSidebarWidths(api, () => {
      api.addPanel({
        id: newPanelId,
        component: 'editor',
        title: PANEL_TITLES.editor,
        position: { referencePanel, direction },
      })
    }, refs)

    const panel = api.getPanel(newPanelId)
    if (!panel) return null
    ctx.editorPanelIdsRef.current.add(newPanelId)
    ctx.sidebarWidthsRef.current = getSidebarWidths(api)
    panel.api.setActive()
    ctx.lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
    return newPanelId
  }, [ctx, bumpVersion, ensureEditorPanel, saveLayout, refs])

  const findEditorPanelForSplit = useCallback((referencePanelId: string, direction: EditorSplitDirection): string | null => {
    const api = ctx.apiRef.current
    if (!api) return null

    const referencePanel = api.getPanel(referencePanelId) ?? api.getPanel(ensureEditorPanel(referencePanelId))
    if (!referencePanel) return null

    const referenceLocation = getGridLocation(referencePanel.group.element)
    const rootOrientation = api.toJSON().grid.orientation as Orientation
    const candidatePanels = Array.from(ctx.editorPanelIdsRef.current)
      .filter((panelId) => panelId !== referencePanelId)
      .map((panelId) => {
        const panel = api.getPanel(panelId)
        if (!panel) return null
        return {
          panelId,
          location: getGridLocation(panel.group.element),
        }
      })
      .filter((panel): panel is { panelId: string; location: number[] } => panel !== null)

    return findAdjacentEditorPanelId(rootOrientation, referenceLocation, candidatePanels, direction)
  }, [ctx, ensureEditorPanel])

  return { ensureEditorPanel, splitEditorPane, findEditorPanelForSplit }
}
