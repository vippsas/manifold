// Covers the sidebar collapse width mechanics: collapsing the sidebar to width
// 0 (remembering its pre-collapse width) and restoring it to exactly that
// width. No UI button collapses anymore, but a previously collapsed sidebar
// persists at width 0 and reopens via the edge rail. Mirrors the real-dockview
// harness in dock-layout-drag-restore.test.tsx (jsdom has no layout engine, so
// element.offsetWidth is wired to dockview's tracked group width).
import React from 'react'
import { render, renderHook, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { applySidebarWidth, collapseSidebar, useSidebarHandleCycle } from './useSidebarHandleCycle'

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
        components={{ sidebar: Probe, agent: Probe, editor: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.layout(1200, 700)
    dv.addPanel({ id: 'sidebar', component: 'sidebar' })
    dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'sidebar', direction: 'right' } })
    dv.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'agent', direction: 'right' } })
    dv.getPanel('sidebar')?.group.api.setSize({ width: 200 })
  })
  wireOffsetWidth(dv, 'sidebar')
  return dv
}

describe('collapseSidebar / applySidebarWidth', () => {
  it('collapses the sidebar to 0 and restores its previous width', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('sidebar')).toBe(200)

    let previous = 0
    act(() => { previous = collapseSidebar(dv) })
    expect(previous).toBe(200)
    expect(widthOf('sidebar')).toBe(0)

    act(() => { applySidebarWidth(dv, previous) })
    expect(widthOf('sidebar')).toBe(200)
  })

  it('reopens a collapsed sidebar on a single click of its edge rail', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1
    const apiRef: React.MutableRefObject<DockviewApi | null> = { current: dv }
    const { result } = renderHook(() => useSidebarHandleCycle(apiRef))

    // Programmatic collapse — remembers the 200px pre-collapse width.
    act(() => { result.current.collapseSidebar() })
    expect(widthOf('sidebar')).toBe(0)

    // refreshEdgeGrab tags the collapsed sash dv-sash--edge-left; a single click
    // (not a double-click) on it reopens to the remembered width.
    const sash = document.querySelector('.dockview-theme-manifold .dv-sash')
    if (!sash) throw new Error('no sash element')
    sash.classList.add('dv-sash--edge-left')
    act(() => { sash.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

    expect(widthOf('sidebar')).toBe(200)
  })
})
