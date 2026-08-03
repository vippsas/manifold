// Regression guard for the sidebar-grows-on-drag bug: dragging a panel to a
// new position (e.g. dropping the editor tab below the agent tab) makes
// dockview redistribute the freed width proportionally across ALL root
// children — the sidebar included. The onDidLayoutChange handler reacts by
// calling restoreSidebarWidth with the remembered width; that restore must
// actually resize the sidebar back. dockview's setConstraints is lazy
// (honoured only during a layout pass), so a pin/release with no layout pass
// in between silently leaves the sidebar grown.
//
// These tests render the REAL dockview library and move the panel through
// panel.api.moveTo — the same moveGroupOrPanel path a drag-and-drop lands in.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { restoreSidebarWidth } from './dock-layout-helpers'

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

describe('restoreSidebarWidth after a drag-style panel move', () => {
  it('shrinks the sidebar back to its remembered width', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('sidebar')).toBe(200)

    // Drag-equivalent move: drop the editor tab on the agent group's bottom
    // edge. The editor's root-level column is removed and its width is
    // redistributed proportionally — the sidebar grows.
    act(() => {
      const agentGroup = dv.getPanel('agent')?.group
      if (!agentGroup) throw new Error('no agent group')
      dv.getPanel('editor')?.api.moveTo({ group: agentGroup, position: 'bottom' })
    })

    // Precondition for the regression: the move actually inflated the sidebar.
    expect(widthOf('sidebar')).toBeGreaterThan(201)

    act(() => {
      restoreSidebarWidth(dv, 200)
    })

    expect(widthOf('sidebar')).toBe(200)
  })
})
