// Regression guard for the sidebars-jump-on-session-switch bug: dock layouts
// are saved per session, so switching the active session (clicking another
// repo/agent in the sidebar) restores the incoming session's layout via
// api.fromJSON — including *its* saved sidebar widths, which made the sidebars
// visibly resize on every click. useDockLayout now captures the widths before
// the switch (captureSidebarWidthsForReload) and re-applies them after the
// load (applyCarriedSidebarWidths). These tests drive the REAL dockview
// library through that same capture → fromJSON → re-apply sequence.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyCarriedSidebarWidths, captureSidebarWidthsForReload } from './dock-layout-helpers'

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

/** jsdom has no layout engine, so element.offsetWidth is always 0. Wire it to
 *  dockview's internally tracked group width — what the DOM reports in the
 *  real app — so the helpers under test read true widths. */
function wireOffsetWidth(api: DockviewApi, panelId: string): void {
  const group = api.getPanel(panelId)?.group
  if (!group) return
  Object.defineProperty(group.element, 'offsetWidth', {
    get: () => group.api.width,
    configurable: true,
  })
}

async function setupDock(): Promise<DockviewApi> {
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1200, height: 700 }}>
      <DockviewReact
        components={{ projects: Probe, agent: Probe, fileTree: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.layout(1200, 700)
    dv.addPanel({ id: 'projects', component: 'projects' })
    dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'projects', direction: 'right' } })
    dv.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
  })
  return dv
}

function setSidebarWidths(dv: DockviewApi, left: number, right: number): void {
  act(() => {
    // Allow sub-minimum (collapsed) widths, like the app's collapse gesture.
    dv.getPanel('projects')?.group.api.setConstraints({ minimumWidth: 0 })
    dv.getPanel('fileTree')?.group.api.setConstraints({ minimumWidth: 0 })
    dv.getPanel('projects')?.group.api.setSize({ width: left })
    dv.getPanel('fileTree')?.group.api.setSize({ width: right })
  })
}

const widthOf = (dv: DockviewApi, panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

/** Snapshot the current layout as another session's saved layout. */
function snapshotLayout(dv: DockviewApi): SerializedDockview {
  return dv.toJSON()
}

function switchToLayout(dv: DockviewApi, saved: SerializedDockview): void {
  act(() => {
    dv.fromJSON(saved)
    dv.layout(1200, 700, true)
  })
  // fromJSON recreates every group, so the offsetWidth wiring must be redone.
  for (const id of ['projects', 'agent', 'fileTree']) wireOffsetWidth(dv, id)
}

describe('sidebar widths carried across a session switch', () => {
  it('re-applies the pre-switch widths over the incoming layout', async () => {
    const dv = await setupDock()

    // The "incoming" session's layout was saved with wide sidebars.
    setSidebarWidths(dv, 400, 350)
    const incoming = snapshotLayout(dv)

    // The user is currently looking at narrow sidebars.
    setSidebarWidths(dv, 200, 180)
    for (const id of ['projects', 'agent', 'fileTree']) wireOffsetWidth(dv, id)
    const carried = captureSidebarWidthsForReload(dv)
    expect(carried).toEqual({ left: 200, right: 180 })

    switchToLayout(dv, incoming)
    // Precondition for the regression: fromJSON restored the incoming widths.
    expect(widthOf(dv, 'projects')).toBe(400)
    expect(widthOf(dv, 'fileTree')).toBe(350)

    act(() => {
      applyCarriedSidebarWidths(dv, carried)
    })

    expect(widthOf(dv, 'projects')).toBe(200)
    expect(widthOf(dv, 'fileTree')).toBe(180)
  })

  it('keeps a collapsed sidebar collapsed across the switch', async () => {
    const dv = await setupDock()

    setSidebarWidths(dv, 400, 350)
    const incoming = snapshotLayout(dv)

    setSidebarWidths(dv, 0, 180)
    for (const id of ['projects', 'agent', 'fileTree']) wireOffsetWidth(dv, id)
    const carried = captureSidebarWidthsForReload(dv)
    expect(carried).toEqual({ left: 0, right: 180 })

    switchToLayout(dv, incoming)
    expect(widthOf(dv, 'projects')).toBe(400)

    act(() => {
      applyCarriedSidebarWidths(dv, carried)
    })

    expect(widthOf(dv, 'projects')).toBe(0)
    expect(widthOf(dv, 'fileTree')).toBe(180)
  })

  it('leaves a sidebar at the incoming width when its panel was absent before', async () => {
    const dv = await setupDock()

    setSidebarWidths(dv, 400, 350)
    const incoming = snapshotLayout(dv)

    // Minimal-style outgoing layout: no fileTree panel at all.
    act(() => {
      const fileTree = dv.getPanel('fileTree')
      if (fileTree) dv.removePanel(fileTree)
      dv.getPanel('projects')?.group.api.setSize({ width: 200 })
    })
    for (const id of ['projects', 'agent']) wireOffsetWidth(dv, id)
    const carried = captureSidebarWidthsForReload(dv)
    expect(carried).toEqual({ left: 200, right: null })

    switchToLayout(dv, incoming)

    act(() => {
      applyCarriedSidebarWidths(dv, carried)
    })

    expect(widthOf(dv, 'projects')).toBe(200)
    // Absent before the switch — keeps the incoming layout's width.
    expect(widthOf(dv, 'fileTree')).toBe(350)
  })
})
