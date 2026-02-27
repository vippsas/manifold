import { useCallback, useRef, useEffect, useState } from 'react'
import type { DockviewApi, SerializedDockview } from 'dockview'

const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell'] as const
export type DockPanelId = (typeof PANEL_IDS)[number]

const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Repositories',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
}

type Direction = 'right' | 'left' | 'above' | 'below' | 'within'

// Fallback positions when no snapshot exists (matches default layout).
const PANEL_RESTORE_HINTS: Record<DockPanelId, Array<{ ref: DockPanelId; dir: Direction }>> = {
  projects: [{ ref: 'fileTree', dir: 'above' }, { ref: 'agent', dir: 'left' }],
  agent: [{ ref: 'projects', dir: 'right' }, { ref: 'editor', dir: 'left' }, { ref: 'shell', dir: 'above' }],
  editor: [{ ref: 'agent', dir: 'right' }, { ref: 'shell', dir: 'above' }],
  fileTree: [{ ref: 'modifiedFiles', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  modifiedFiles: [{ ref: 'fileTree', dir: 'within' }, { ref: 'projects', dir: 'below' }],
  shell: [{ ref: 'agent', dir: 'below' }, { ref: 'editor', dir: 'below' }],
}

export interface UseDockLayoutResult {
  apiRef: React.MutableRefObject<DockviewApi | null>
  onReady: (api: DockviewApi) => void
  togglePanel: (id: DockPanelId) => void
  isPanelVisible: (id: DockPanelId) => boolean
  resetLayout: () => void
  hiddenPanels: DockPanelId[]
}

const DEFAULT_SIDEBAR_WIDTH = 300

/** Read the sidebar group's current pixel width (0 if unavailable). */
function getSidebarWidth(api: DockviewApi): number {
  try {
    return api.getPanel('projects')?.group?.element.offsetWidth ?? 0
  } catch {
    return 0
  }
}

/** Restore the sidebar to a specific pixel width on the next frame. */
function restoreSidebarWidth(api: DockviewApi, width: number): void {
  if (width <= 0) return
  requestAnimationFrame(() => {
    try {
      api.getPanel('projects')?.group?.api.setSize({ width })
    } catch { /* best-effort */ }
  })
}

// ── Serialized layout tree helpers ──────────────────────────────────────
// dockview doesn't export the node types so we define them locally.

type GridNode =
  | { type: 'branch'; data: GridNode[]; size: number }
  | { type: 'leaf'; data: { views: string[]; id: string; activeView?: string }; size: number }

/** Does `node` (or any descendant) contain a group whose `views` include `panelId`? */
function treeContainsPanel(node: GridNode, panelId: string): boolean {
  if (node.type === 'leaf') return node.data.views.includes(panelId)
  return node.data.some((child) => treeContainsPanel(child, panelId))
}

/**
 * Remove the leaf containing `panelId` from `parent` (in-place).
 * If a branch is left with one child, the child is promoted in its place
 * (keeping the branch's size so the top-level split is unchanged).
 * Freed space within a branch is proportionally distributed to siblings.
 */
function removeLeafFromTree(parent: GridNode & { type: 'branch' }, panelId: string): number {
  for (let i = 0; i < parent.data.length; i++) {
    const child = parent.data[i]

    // Leaf with multiple tabs → just remove the tab, keep the group
    if (child.type === 'leaf' && child.data.views.includes(panelId)) {
      if (child.data.views.length > 1) {
        child.data.views = child.data.views.filter((v) => v !== panelId)
        if (child.data.activeView === panelId) child.data.activeView = child.data.views[0]
        return 0
      }
      parent.data.splice(i, 1)
      return child.size
    }

    // Recurse into branches
    if (child.type === 'branch' && treeContainsPanel(child, panelId)) {
      const freed = removeLeafFromTree(child, panelId)
      if (child.data.length === 1) {
        // Promote the sole remaining child, keeping the branch's size
        const promoted = child.data[0]
        promoted.size = child.size
        parent.data[i] = promoted
      } else if (freed > 0) {
        // Distribute freed space among remaining siblings
        const scale = child.size / (child.size - freed)
        for (const sibling of child.data) sibling.size = Math.round(sibling.size * scale)
      }
      return 0 // size absorbed within the branch
    }
  }
  return 0
}

export function useDockLayout(sessionId: string | null): UseDockLayoutResult {
  const apiRef = useRef<DockviewApi | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId

  // Incremented on layout changes to trigger re-render for hiddenPanels
  const [, setLayoutVersion] = useState(0)
  const bumpVersion = useCallback(() => setLayoutVersion((v) => v + 1), [])

  // Layout snapshot taken before each panel removal, keyed by panel ID
  const lastLayoutRef = useRef<SerializedDockview | null>(null)
  const closedPanelSnapshots = useRef<Map<DockPanelId, SerializedDockview>>(new Map())
  const isRestoringRef = useRef(false)

  const saveLayout = useCallback(() => {
    const api = apiRef.current
    const sid = sessionIdRef.current
    if (!api || !sid) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const json = api.toJSON()
      void window.electronAPI.invoke('dock-layout:set', sid, json)
    }, 500)
  }, [])

  const buildDefaultLayout = useCallback((api: DockviewApi) => {
    // 1. Left column: Projects
    const projectsPanel = api.addPanel({
      id: 'projects',
      component: 'projects',
      title: PANEL_TITLES.projects,
    })

    // 2. Right area: Agent (right of Projects)
    api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
      position: { referencePanel: projectsPanel, direction: 'right' },
    })

    // 3. Split left column: Files below Projects
    const filesPanel = api.addPanel({
      id: 'fileTree',
      component: 'fileTree',
      title: PANEL_TITLES.fileTree,
      position: { referencePanel: projectsPanel, direction: 'below' },
    })

    api.addPanel({
      id: 'modifiedFiles',
      component: 'modifiedFiles',
      title: PANEL_TITLES.modifiedFiles,
      position: { referencePanel: filesPanel, direction: 'within' },
    })

    // Make Files the active tab in its group
    filesPanel.api.setActive()

    try {
      projectsPanel.group?.api.setSize({ width: DEFAULT_SIDEBAR_WIDTH })
    } catch {
      // sizing is best-effort
    }
  }, [])

  const buildMinimalLayout = useCallback((api: DockviewApi) => {
    const projectsPanel = api.addPanel({
      id: 'projects',
      component: 'projects',
      title: PANEL_TITLES.projects,
    })

    api.addPanel({
      id: 'agent',
      component: 'agent',
      title: PANEL_TITLES.agent,
      position: { referencePanel: projectsPanel, direction: 'right' },
    })

    try {
      projectsPanel.group?.api.setSize({ width: DEFAULT_SIDEBAR_WIDTH })
    } catch {
      // sizing is best-effort
    }
  }, [])

  const onReady = useCallback(
    (api: DockviewApi) => {
      apiRef.current = api

      const sid = sessionIdRef.current
      if (sid) {
        void (async () => {
          try {
            const saved = (await window.electronAPI.invoke('dock-layout:get', sid)) as SerializedDockview | null
            if (saved && saved.grid && saved.panels) {
              const panelIds = new Set(Object.keys(saved.panels))
              const isCorruptedMinimal = panelIds.size === 2 && panelIds.has('projects') && panelIds.has('agent')
              if (!isCorruptedMinimal) {
                isRestoringRef.current = true
                try {
                  api.fromJSON(saved)
                } finally {
                  isRestoringRef.current = false
                }
                lastLayoutRef.current = saved
                return
              }
            }
          } catch {
            // ignore load errors, fall through to default
          }
          isRestoringRef.current = true
          try {
            buildDefaultLayout(api)
          } finally {
            isRestoringRef.current = false
          }
          lastLayoutRef.current = api.toJSON()
        })()
      } else {
        isRestoringRef.current = true
        try {
          buildMinimalLayout(api)
        } finally {
          isRestoringRef.current = false
        }
        lastLayoutRef.current = api.toJSON()
      }

      // When a panel is removed, save the pre-removal layout for that panel
      api.onDidRemovePanel((panel) => {
        if (isRestoringRef.current) return
        const id = panel.id as DockPanelId
        if (PANEL_IDS.includes(id) && lastLayoutRef.current) {
          closedPanelSnapshots.current.set(id, lastLayoutRef.current)
        }
      })

      api.onDidLayoutChange(() => {
        if (isRestoringRef.current) return
        lastLayoutRef.current = api.toJSON()
        saveLayout()
        bumpVersion()
      })
    },
    [buildDefaultLayout, buildMinimalLayout, saveLayout, bumpVersion]
  )

  // When sessionId changes, try to load the layout for the new session
  const prevSessionRef = useRef(sessionId)
  useEffect(() => {
    if (sessionId === prevSessionRef.current) return
    prevSessionRef.current = sessionId
    const api = apiRef.current
    if (!api) return

    // Cancel any pending save timer from the previous session to prevent
    // a stale (e.g. minimal) layout from being saved under the new session ID.
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (!sessionId) {
      isRestoringRef.current = true
      try {
        api.clear()
        buildMinimalLayout(api)
      } finally {
        isRestoringRef.current = false
      }
      lastLayoutRef.current = api.toJSON()
      return
    }

    void (async () => {
      try {
        const saved = (await window.electronAPI.invoke('dock-layout:get', sessionId)) as SerializedDockview | null
        if (saved && saved.grid && saved.panels) {
          // Detect corrupted minimal-only layouts (only projects + agent) that were
          // accidentally saved due to a race condition. Treat them as missing and
          // fall through to the default layout.
          const panelIds = new Set(Object.keys(saved.panels))
          const isCorruptedMinimal = panelIds.size === 2 && panelIds.has('projects') && panelIds.has('agent')
          if (!isCorruptedMinimal) {
            isRestoringRef.current = true
            try {
              api.fromJSON(saved)
            } finally {
              isRestoringRef.current = false
            }
            lastLayoutRef.current = saved
            return
          }
        }
      } catch {
        // ignore
      }
      // Clear and rebuild default if no saved layout (or corrupted)
      isRestoringRef.current = true
      try {
        api.clear()
        buildDefaultLayout(api)
      } finally {
        isRestoringRef.current = false
      }
      lastLayoutRef.current = api.toJSON()
    })()
  }, [sessionId, buildDefaultLayout, buildMinimalLayout])

  const togglePanel = useCallback((id: DockPanelId) => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(id)
    if (panel) {
      // Save the pre-removal snapshot for reopening later
      const preRemovalLayout = api.toJSON()
      closedPanelSnapshots.current.set(id, preRemovalLayout)

      // Build a patched layout that removes the panel but preserves all sizes.
      // We avoid api.removePanel() because dockview uses Sizing.Distribute
      // which forces all grid siblings to equal width.
      const json = JSON.parse(JSON.stringify(preRemovalLayout)) as SerializedDockview
      const root = json.grid.root as GridNode
      if (root.type === 'branch') {
        const freed = removeLeafFromTree(root, id)
        // When a top-level child is removed, its freed space must be
        // redistributed so that fromJSON sees sizes that sum to the full
        // width. Give the space to non-sidebar siblings so the sidebar
        // width is preserved exactly.
        if (freed > 0 && root.data.length > 0) {
          const sidebarIdx = root.data.findIndex((c) =>
            c.type === 'leaf'
              ? c.data.views.includes('projects')
              : treeContainsPanel(c, 'projects')
          )
          const targets = root.data.filter((_, i) => i !== sidebarIdx)
          if (targets.length > 0) {
            const share = freed / targets.length
            for (const t of targets) t.size = Math.round(t.size + share)
          } else {
            // Only sidebar remains — scale proportionally
            const total = root.data.reduce((s, c) => s + c.size, 0)
            const scale = (total + freed) / total
            for (const c of root.data) c.size = Math.round(c.size * scale)
          }
        }
      }
      delete (json.panels as Record<string, unknown>)[id]

      isRestoringRef.current = true
      try {
        api.fromJSON(json)
      } finally {
        isRestoringRef.current = false
      }
      lastLayoutRef.current = api.toJSON()
      saveLayout()
      bumpVersion()
    } else {
      // Try to restore from snapshot (exact previous position)
      const snapshot = closedPanelSnapshots.current.get(id)
      if (snapshot) {
        const currentlyVisible = new Set(
          PANEL_IDS.filter((pid) => api.getPanel(pid) !== undefined)
        )
        const sidebarWidth = getSidebarWidth(api)

        isRestoringRef.current = true
        try {
          api.fromJSON(snapshot)
          // Remove panels that weren't visible before reopening
          for (const pid of PANEL_IDS) {
            if (pid !== id && !currentlyVisible.has(pid)) {
              const p = api.getPanel(pid)
              if (p) api.removePanel(p)
            }
          }
        } finally {
          isRestoringRef.current = false
        }

        restoreSidebarWidth(api, sidebarWidth)
        lastLayoutRef.current = api.toJSON()
        saveLayout()
        bumpVersion()
        closedPanelSnapshots.current.delete(id)
        return
      }

      // Fallback: use static position hints
      const sidebarWidth = getSidebarWidth(api)
      const hints = PANEL_RESTORE_HINTS[id]
      let position: { referencePanel: ReturnType<DockviewApi['getPanel']>; direction: Direction } | undefined
      for (const hint of hints) {
        const ref = api.getPanel(hint.ref)
        if (ref) {
          position = { referencePanel: ref, direction: hint.dir }
          break
        }
      }
      api.addPanel({
        id,
        component: id,
        title: PANEL_TITLES[id],
        ...(position ? { position } : {}),
      })
      restoreSidebarWidth(api, sidebarWidth)
    }
  }, [saveLayout, bumpVersion])

  const isPanelVisible = useCallback((id: DockPanelId): boolean => {
    const api = apiRef.current
    if (!api) return true
    return api.getPanel(id) !== undefined
  }, [])

  const resetLayout = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    api.clear()
    buildDefaultLayout(api)
    closedPanelSnapshots.current.clear()
    lastLayoutRef.current = api.toJSON()
  }, [buildDefaultLayout])

  // Compute hidden panels
  const hiddenPanels = PANEL_IDS.filter((id) => {
    const api = apiRef.current
    if (!api) return false
    return api.getPanel(id) === undefined
  }) as DockPanelId[]

  return {
    apiRef,
    onReady,
    togglePanel,
    isPanelVisible,
    resetLayout,
    hiddenPanels,
  }
}
