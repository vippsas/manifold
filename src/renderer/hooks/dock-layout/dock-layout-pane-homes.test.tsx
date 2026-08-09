// Pins where each pane lands, against a real dockview grid.
//
// Placement used to depend on history: `addPanel(..., 'below')` splits only the
// reference pane's cell, so opening shell-then-editor and editor-then-shell gave
// different layouts; and a reopened pane replayed a snapshot of a layout that
// might no longer exist, which could land the shell under the editor or as a
// full-height column left of the agent. Every sequence below now converges on
// the same arrangement: sidebar as the full-height left column, the workspace
// panes in a row, and the shell as a bar spanning that row.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyDefaultLayout } from './dock-layout-builders'
import { hidePanel, showPanelFromHints, showPanelFromSnapshot } from './dock-layout-loader'
import { ensureEditorPanelInWorkspace } from './dock-layout-editor'
import type { DockPanelId, GridNode, LayoutRefs } from './dock-layout-helpers'

beforeAll(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

function Probe(props: IDockviewPanelProps): React.JSX.Element {
  return <div>{props.api.id}</div>
}

/** `a | b` = side by side, `a / b` = stacked. */
function describeTree(json: SerializedDockview): string {
  const rootOrientation = json.grid.orientation
  const walk = (node: GridNode, orientation: string): string => {
    if (node.type === 'leaf') return node.data.views.join('+')
    const separator = orientation === 'HORIZONTAL' ? ' | ' : ' / '
    const flipped = orientation === 'HORIZONTAL' ? 'VERTICAL' : 'HORIZONTAL'
    return `(${node.data.map((child) => walk(child, flipped)).join(separator)})`
  }
  return walk(json.grid.root as GridNode, rootOrientation)
}

interface Dock {
  api: DockviewApi
  open: (id: DockPanelId) => void
  openEditor: () => void
  close: (id: DockPanelId) => void
  /** Persist and reload, as an app restart does — snapshots are in-memory only. */
  restart: () => void
  tree: () => string
}

async function setupDock(): Promise<Dock> {
  let ready: DockviewApi | null = null
  render(
    <div style={{ width: 1200, height: 700 }}>
      <DockviewReact
        className="dockview-theme-manifold"
        components={{ sidebar: Probe, agent: Probe, editor: Probe, shell: Probe }}
        onReady={(event) => { ready = event.api }}
      />
    </div>,
  )
  await waitFor(() => expect(ready).not.toBeNull())
  const api = ready as unknown as DockviewApi

  const refs: LayoutRefs = { isRestoringRef: { current: false }, lastLayoutRef: { current: null } }
  const snapshots = { current: new Map<DockPanelId, SerializedDockview>() }

  act(() => {
    api.layout(1200, 700)
    applyDefaultLayout(api)
  })

  return {
    api,
    open: (id) => act(() => {
      const snapshot = snapshots.current.get(id)
      if (snapshot) showPanelFromSnapshot(api, id, snapshot, snapshots, refs)
      else showPanelFromHints(api, id, refs)
    }),
    openEditor: () => act(() => { ensureEditorPanelInWorkspace(api) }),
    close: (id) => act(() => { hidePanel(api, id, snapshots, refs) }),
    restart: () => {
      const saved = api.toJSON()
      snapshots.current.clear()
      act(() => { api.fromJSON(saved) })
    },
    tree: () => describeTree(api.toJSON()),
  }
}

const SPANNING = '(sidebar | ((agent | editor) / shell))'

describe('every pane has one home', () => {
  it('starts as the sidebar beside the agent', async () => {
    const dock = await setupDock()
    expect(dock.tree()).toBe('(sidebar | agent)')
  })

  it('spans the shell across the workspace whichever order the panes open in', async () => {
    const shellFirst = await setupDock()
    shellFirst.open('shell')
    shellFirst.openEditor()
    expect(shellFirst.tree()).toBe(SPANNING)

    const editorFirst = await setupDock()
    editorFirst.openEditor()
    editorFirst.open('shell')
    expect(editorFirst.tree()).toBe(SPANNING)
  })

  it('reopens the shell spanning the workspace, not under the editor', async () => {
    const dock = await setupDock()
    dock.open('shell')
    dock.openEditor()
    dock.close('shell')
    dock.open('shell')
    expect(dock.tree()).toBe(SPANNING)
  })

  it('reopens the shell the same way before and after a restart', async () => {
    const dock = await setupDock()
    dock.open('shell')
    dock.openEditor()
    dock.restart()
    dock.close('shell')
    dock.restart()
    dock.open('shell')
    expect(dock.tree()).toBe(SPANNING)
  })

  // The reported bug: closing the agent promoted the shell to a full-height
  // column, and the snapshot then reopened it as a column left of the agent.
  it('never reopens the shell as a column beside the agent', async () => {
    const dock = await setupDock()
    dock.openEditor()
    dock.open('shell')
    dock.close('agent')
    dock.close('shell')
    dock.open('agent')
    dock.open('shell')
    expect(dock.tree()).toBe(SPANNING)
  })

  it('keeps the sidebar a full-height column across a toggle', async () => {
    const dock = await setupDock()
    dock.open('shell')
    dock.openEditor()
    dock.close('sidebar')
    dock.open('sidebar')
    expect(dock.tree()).toBe(SPANNING)
  })

  it('does not drift over repeated toggles', async () => {
    const dock = await setupDock()
    dock.open('shell')
    dock.openEditor()
    for (let round = 0; round < 3; round += 1) {
      dock.close('shell')
      dock.open('shell')
      dock.close('sidebar')
      dock.open('sidebar')
      expect(dock.tree()).toBe(SPANNING)
    }
  })
})

describe('a reopened pane keeps its size but not its position', () => {
  it('restores the height the shell was dragged to', async () => {
    const dock = await setupDock()
    dock.open('shell')
    dock.openEditor()
    act(() => { dock.api.getPanel('shell')?.group.api.setSize({ height: 260 }) })

    dock.close('shell')
    dock.open('shell')

    expect(dock.api.getPanel('shell')?.group.api.height).toBe(260)
    expect(dock.tree()).toBe(SPANNING)
  })

  it('ignores a size measured across the other axis', async () => {
    const dock = await setupDock()
    dock.openEditor()
    dock.open('shell')
    // Closing the agent leaves the shell a full-height column, so its captured
    // size is a width. Reopening it as a bar must not adopt that as a height.
    dock.close('agent')
    dock.close('shell')
    dock.open('agent')
    dock.open('shell')

    const height = dock.api.getPanel('shell')?.group.api.height ?? 0
    expect(height).toBeGreaterThan(0)
    expect(height).toBeLessThan(700)
  })
})
