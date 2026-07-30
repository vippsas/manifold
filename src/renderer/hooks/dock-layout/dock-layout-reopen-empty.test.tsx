// Regression guard for reopening panels into an emptied dock: close every
// panel, reopen 'projects' first (it takes the full dock width), then toggle
// the others back on. Each reopen runs inside withPinnedSidebars, which pinned
// the projects group at its current width — the full dock — so every newly
// added group was clamped to width 0 and its panel rendered invisible until
// projects was toggled closed and open again. The pin must be skipped when it
// would leave no unpinned group to absorb the new panel's space.
//
// These tests render the REAL dockview library and reopen panels through the
// real showPanelFromHints path togglePanel lands in.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { showPanelFromHints } from './dock-layout-helpers'

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

async function setupEmptiedDockWithProjectsOnly(): Promise<DockviewApi> {
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1200, height: 700 }}>
      <DockviewReact
        components={{ projects: Probe, agent: Probe, modifiedFiles: Probe, shell: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.layout(1200, 700)
    // The state after "close all panels, reopen Repositories first": the
    // projects sidebar is the only group and owns the full dock width.
    dv.addPanel({ id: 'projects', component: 'projects' })
  })
  wireOffsetWidth(dv, 'projects')
  return dv
}

describe('reopening panels into a dock where only the projects sidebar survives', () => {
  it('gives the reopened panel real width instead of clamping it to 0', async () => {
    const dv = await setupEmptiedDockWithProjectsOnly()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('projects')).toBe(1200)

    act(() => {
      showPanelFromHints(dv, 'agent')
    })

    // Not the naive 50/50 split: the sidebar shrinks back to its default
    // one-sixth share and the reopened center pane takes the rest.
    expect(widthOf('projects')).toBeGreaterThan(0)
    expect(widthOf('projects')).toBeLessThanOrEqual(210)
    expect(widthOf('agent')).toBeGreaterThanOrEqual(980)
  })

  it('keeps every subsequently reopened panel visible as well', async () => {
    const dv = await setupEmptiedDockWithProjectsOnly()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    act(() => {
      showPanelFromHints(dv, 'agent')
    })
    act(() => {
      showPanelFromHints(dv, 'modifiedFiles')
    })
    act(() => {
      showPanelFromHints(dv, 'shell')
    })

    for (const id of ['projects', 'agent', 'modifiedFiles', 'shell']) {
      expect(widthOf(id), `panel '${id}' should be visible`).toBeGreaterThan(0)
    }
    // The groups must share the dock, not overflow it: a full-width pinned
    // sidebar plus minimum-width new groups would sum past the dock width and
    // render the new panels invisible once the browser clamps the layout.
    const columns = new Set(['projects', 'agent', 'modifiedFiles'].map((id) => dv.getPanel(id)?.group))
    const columnSum = Array.from(columns).reduce((sum, group) => sum + (group?.api.width ?? 0), 0)
    expect(columnSum).toBeLessThanOrEqual(1200)
    // And the proportions land at the default 1:4:1 layout, not arbitrary
    // 50/50 splits: each sidebar at its one-sixth share, center the rest.
    expect(widthOf('projects')).toBeLessThanOrEqual(210)
    expect(widthOf('modifiedFiles')).toBeLessThanOrEqual(210)
    expect(widthOf('agent')).toBeGreaterThanOrEqual(760)
  })
})
