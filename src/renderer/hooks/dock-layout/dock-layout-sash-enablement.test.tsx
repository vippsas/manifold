// Regression guard for resize handles going dead after panel operations.
// dockview recomputes each sash's enabled/disabled state only during a layout
// pass (updateSashEnablement in layoutViews); setConstraints alone never
// triggers one. The pinned-sidebar helpers run their layout pass WHILE groups
// are pinned min==max — marking the adjacent sashes dv-disabled — and then
// release the constraints without another pass, leaving dividers stuck with a
// non-resize cursor ("sometimes I can't resize") until an unrelated relayout.
// The helpers must force a same-size pass after releasing the pins.
//
// These tests render the REAL dockview library and inspect the real sash DOM.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { restoreSidebarWidths, withPinnedSidebars } from './dock-layout-helpers'

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
        components={{ projects: Probe, agent: Probe, fileTree: Probe, shell: Probe }}
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
    dv.getPanel('projects')?.group.api.setSize({ width: 200 })
    dv.getPanel('fileTree')?.group.api.setSize({ width: 200 })
  })
  wireOffsetWidth(dv, 'projects')
  wireOffsetWidth(dv, 'fileTree')
  return dv
}

function disabledSashCount(): number {
  return document.querySelectorAll('.dv-sash.dv-disabled').length
}

describe('sash enablement after pinned layout mutations', () => {
  it('leaves every divider resizable after a withPinnedSidebars mutation', async () => {
    const dv = await setupDock()

    act(() => {
      withPinnedSidebars(dv, () => {
        dv.addPanel({ id: 'shell', component: 'shell', position: { referencePanel: 'agent', direction: 'below' } })
      })
    })

    // The mutation's layout pass ran while the sidebars were pinned min==max,
    // which disables their sashes; releasing the pins must re-enable them.
    expect(disabledSashCount()).toBe(0)
  })

  it('leaves every divider resizable after restoreSidebarWidths', async () => {
    const dv = await setupDock()

    act(() => {
      restoreSidebarWidths(dv, { left: 150, right: 150 })
    })

    expect(dv.getPanel('projects')?.group.api.width).toBe(150)
    expect(disabledSashCount()).toBe(0)
  })
})
