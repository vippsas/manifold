// Regression guard for the sidebar-scales-with-the-window bug: dockview
// hardcodes proportionalLayout: true (dockviewComponent.js:117) and its own
// source says the flag is "not supported" as an option
// (baseComponentGridview.js:192), so widening the window widens every column —
// the sidebar included. VS Code instead holds low-priority chrome at its pixel
// width and hands all the slack to the editor. registerLayoutListeners
// reproduces that by re-pinning the remembered sidebar width whenever the dock's
// own width changed, which is what separates a window resize from a user
// dragging a divider (that leaves the dock width alone).
//
// Renders the REAL dockview library, so the proportional redistribution under
// test is dockview's, not a stub's.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { registerLayoutListeners, restoreSidebarWidthAfterResize } from './dock-layout-lifecycle'
import { makeTestDockLayoutCtx } from './dock-layout-test-ctx'
import { setRenderedWidth } from './useSidebarHandleCycle'

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
 *  dockview's internally tracked group width — what the DOM reports in the real
 *  app — so the width bookkeeping under test reads true widths. */
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
        components={{ sidebar: Probe, agent: Probe }}
        // The app's theme gap, which is what makes the restore lose pixels: the
        // pin constrains a slot that carries the group's share of the gap.
        // Without it this dock cannot reproduce the drift at all.
        theme={{ name: 'test', className: '', gap: 6 }}
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
    const sidebar = dv.getPanel('sidebar')?.group
    if (!sidebar) throw new Error('no sidebar group')
    // setSize takes the view's *slot*, which includes its share of the gap, so
    // asking for 200 renders 197. Size by rendered width so the pinned width and
    // the on-screen width are the same number.
    setRenderedWidth(sidebar, 200)
  })
  wireOffsetWidth(dv, 'sidebar')
  return dv
}

describe('sidebar width across a window resize', () => {
  it('holds the sidebar at its pixel width and gives the slack to the center pane', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    const ctx = makeTestDockLayoutCtx(dv)
    ctx.sidebarWidthRef.current = 200
    ctx.lastLayoutRef.current = dv.toJSON()
    registerLayoutListeners(dv, ctx)

    expect(widthOf('sidebar')).toBe(200)
    const agentBefore = widthOf('agent')

    // The real sequence: dockview's ResizeObserver relays the grid out at the
    // new width (scaling every column), then the re-pin runs on the next frame.
    act(() => { dv.layout(1600, 700) })
    expect(widthOf('sidebar')).toBeGreaterThan(201) // precondition: it scaled

    act(() => { restoreSidebarWidthAfterResize(dv, ctx) })

    expect(widthOf('sidebar')).toBe(200)
    expect(widthOf('agent')).toBe(agentBefore + 400)
  })

  it('does not walk the sidebar thinner across repeated resizes', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    const ctx = makeTestDockLayoutCtx(dv)
    ctx.sidebarWidthRef.current = 200
    ctx.lastLayoutRef.current = dv.toJSON()
    registerLayoutListeners(dv, ctx)

    // Each restore pins the view's *slot*, which carries the group's share of
    // the theme gap, so an uncompensated restore renders a few pixels short and
    // never gives them back — a drift that compounds resize after resize.
    for (const width of [1600, 1200, 1600, 1300, 1800]) {
      act(() => { dv.layout(width, 700) })
      act(() => { restoreSidebarWidthAfterResize(dv, ctx) })
      expect(widthOf('sidebar')).toBe(200)
    }
  })

  it('still lets a divider drag change the sidebar width', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    const ctx = makeTestDockLayoutCtx(dv)
    ctx.sidebarWidthRef.current = 200
    ctx.lastLayoutRef.current = dv.toJSON()
    registerLayoutListeners(dv, ctx)

    // A divider drag resizes the group without changing the dock's own width,
    // so it must be recorded as the new pinned width rather than undone.
    await act(async () => {
      const sidebar = dv.getPanel('sidebar')?.group
      if (!sidebar) throw new Error('no sidebar group')
      setRenderedWidth(sidebar, 320)
      await Promise.resolve()
    })

    expect(widthOf('sidebar')).toBe(320)
    expect(ctx.sidebarWidthRef.current).toBe(320)
  })
})
