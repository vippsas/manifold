// Reproduces the bug where a collapsed sidebar reopens after an agent switch.
// Switching agents reloads the dock via api.toJSON()/api.fromJSON(); dockview
// strips a group's minimumWidth:0 on serialize and recreates it with the default
// 100px minimum, so a sidebar collapsed to width 0 is clamped back open on
// restore. Uses the real-dockview jsdom harness (offsetWidth wired to dockview's
// tracked group width), mirroring useSidebarHandleCycle.collapse.test.tsx.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { collapseSidebar } from './useSidebarHandleCycle'
import { restoreCollapsedSidebarWidths } from './dock-layout-helpers'

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

function wireOffsetWidth(api: DockviewApi, panelId: string): void {
  const group = api.getPanel(panelId)?.group
  if (!group) throw new Error(`no group for panel '${panelId}'`)
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
        className="dockview-theme-manifold"
        components={{ projects: Probe, agent: Probe, editor: Probe, fileTree: Probe }}
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
    dv.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'agent', direction: 'right' } })
    dv.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'editor', direction: 'right' } })
    dv.getPanel('projects')?.group.api.setSize({ width: 200 })
    dv.getPanel('fileTree')?.group.api.setSize({ width: 200 })
  })
  wireOffsetWidth(dv, 'projects')
  wireOffsetWidth(dv, 'fileTree')
  return dv
}

describe('collapsed sidebar survives a toJSON/fromJSON reload', () => {
  it('documents the dockview clamp: a plain reload reopens a collapsed sidebar', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('fileTree')).toBe(200)
    act(() => { collapseSidebar(dv, 'right') })
    expect(widthOf('fileTree')).toBe(0)

    act(() => { dv.fromJSON(dv.toJSON()) })
    wireOffsetWidth(dv, 'fileTree')

    // fromJSON recreates the group at dockview's 100px default minimum, so the
    // collapsed 0-width is clamped back open — this is the bug being fixed.
    expect(widthOf('fileTree')).toBe(100)
  })

  it('restoreCollapsedSidebarWidths keeps the right sidebar collapsed after reload', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    act(() => { collapseSidebar(dv, 'right') })
    const saved = dv.toJSON()

    act(() => {
      dv.fromJSON(saved)
      restoreCollapsedSidebarWidths(dv, saved)
    })
    wireOffsetWidth(dv, 'projects')
    wireOffsetWidth(dv, 'fileTree')

    expect(widthOf('fileTree')).toBe(0)
    // The other sidebar is left untouched.
    expect(widthOf('projects')).toBe(200)
  })

  it('restoreCollapsedSidebarWidths keeps the left sidebar collapsed after reload', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    act(() => { collapseSidebar(dv, 'left') })
    const saved = dv.toJSON()

    act(() => {
      dv.fromJSON(saved)
      restoreCollapsedSidebarWidths(dv, saved)
    })
    wireOffsetWidth(dv, 'projects')
    wireOffsetWidth(dv, 'fileTree')

    expect(widthOf('projects')).toBe(0)
    expect(widthOf('fileTree')).toBe(200)
  })

  it('leaves non-collapsed sidebars untouched on reload', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    const saved = dv.toJSON()
    act(() => {
      dv.fromJSON(saved)
      restoreCollapsedSidebarWidths(dv, saved)
    })
    wireOffsetWidth(dv, 'projects')
    wireOffsetWidth(dv, 'fileTree')

    expect(widthOf('projects')).toBe(200)
    expect(widthOf('fileTree')).toBe(200)
  })
})
