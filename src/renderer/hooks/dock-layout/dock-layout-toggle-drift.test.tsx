// Regression guard for "the view hakker when I click back and forth": toggling
// a panel off and on must land the layout back where it started. It did not.
// The pinned-sidebar helpers release a pin with a same-size setSize poke, but
// dockview's setSize takes the view's *slot* size while api.width reports the
// rendered width — with a theme gap the two differ by that view's share of the
// gap (splitview lays each view out at `size - margin * sashes / views`). So
// every pin release shaved 3-4px off each sidebar, four times per off/on cycle:
// the sidebar walked ~12px narrower on every toggle and never came back.
//
// These tests render the REAL dockview library with the app's real theme gap.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { withPinnedSidebars } from './dock-layout-helpers'
import { hidePanel, showPanelFromSnapshot } from './dock-layout-loader'
import type { DockPanelId } from './dock-layout-helpers'

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

function makeRefs(): { isRestoringRef: { current: boolean }; lastLayoutRef: { current: SerializedDockview | null } } {
  return { isRestoringRef: { current: false }, lastLayoutRef: { current: null } }
}

/** jsdom has no layout engine, so offsetWidth is 0; wire it to the width
 *  dockview tracks, which is what the DOM reports in the real app. */
function wireOffsetWidth(api: DockviewApi, panelId: string): void {
  const group = api.getPanel(panelId)?.group
  if (!group) throw new Error(`no group for panel '${panelId}'`)
  Object.defineProperty(group.element, 'offsetWidth', {
    get: () => group.api.width,
    configurable: true,
  })
}

const widthOf = (api: DockviewApi, panelId: string): number | undefined =>
  api.getPanel(panelId)?.group.api.width

/** The dock as the app builds it: sidebars either side of the agent, the editor
 *  tabbed into the right sidebar item, and the app's real group gap. */
async function setupDock(): Promise<DockviewApi> {
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1200, height: 700 }}>
      <DockviewReact
        theme={{ name: 'manifold', className: '', gap: 6 }}
        components={{ projects: Probe, agent: Probe, modifiedFiles: Probe, editor: Probe, shell: Probe }}
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
    dv.addPanel({ id: 'modifiedFiles', component: 'modifiedFiles', position: { referencePanel: 'agent', direction: 'right' } })
    dv.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'modifiedFiles', direction: 'within' } })
    dv.getPanel('projects')?.group.api.setSize({ width: 200 })
    dv.getPanel('modifiedFiles')?.group.api.setSize({ width: 200 })
  })
  wireOffsetWidth(dv, 'projects')
  wireOffsetWidth(dv, 'modifiedFiles')
  return dv
}

describe('panel toggling leaves the layout where it found it', () => {
  it('releasing a pin does not shrink the pinned sidebar', async () => {
    const dv = await setupDock()
    const before = widthOf(dv, 'projects')

    act(() => { withPinnedSidebars(dv, () => {}) })

    expect(widthOf(dv, 'projects')).toBe(before)
  })

  it('keeps the sidebar width across repeated close/reopen cycles', async () => {
    const dv = await setupDock()
    const before = widthOf(dv, 'projects')
    const snapshots = { current: new Map<DockPanelId, SerializedDockview>() }

    for (let cycle = 0; cycle < 5; cycle += 1) {
      act(() => { hidePanel(dv, 'editor', snapshots, makeRefs()) })
      const snapshot = snapshots.current.get('editor')
      if (!snapshot) throw new Error('hidePanel did not record a snapshot')
      act(() => { showPanelFromSnapshot(dv, 'editor', snapshot, snapshots, makeRefs()) })
    }

    expect(widthOf(dv, 'projects')).toBe(before)
  })
})
