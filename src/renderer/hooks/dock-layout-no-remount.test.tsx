// Regression guard for the agent-pane "refresh" bug: opening/closing a pane
// must NOT tear down and remount sibling panels. The agent terminal lives in a
// sibling panel; a remount disposes its xterm and replays scrollback (a visible
// flash). These tests render the REAL dockview library and drive the REAL
// layout helpers, asserting sibling panels stay mounted across a toggle.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { hidePanel, showPanelFromHints, showPanelFromSnapshot } from './dock-layout-loader'
import type { DockPanelId } from './dock-layout-helpers'
import type { SerializedDockview } from 'dockview'

beforeAll(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

let mounts: Record<string, number> = {}

function Probe(props: IDockviewPanelProps): React.JSX.Element {
  const id = props.api.id
  React.useEffect(() => {
    mounts[id] = (mounts[id] ?? 0) + 1
    return undefined
  }, [id])
  return <div data-testid={`panel-${id}`}>{id}</div>
}

function makeRefs(): { isRestoringRef: { current: boolean }; lastLayoutRef: { current: SerializedDockview | null } } {
  return { isRestoringRef: { current: false }, lastLayoutRef: { current: null } }
}

async function setupDock(): Promise<DockviewApi> {
  mounts = {}
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1000, height: 700 }}>
      <DockviewReact
        components={{ agent: Probe, editor: Probe, shell: Probe, projects: Probe, fileTree: Probe, modifiedFiles: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.addPanel({ id: 'projects', component: 'projects' })
    dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'projects', direction: 'right' } })
  })
  await waitFor(() => expect(mounts.agent).toBe(1))
  return dv
}

describe('dock layout toggles do not remount sibling panels', () => {
  it('closing a pane (hidePanel) keeps the agent panel mounted', async () => {
    const dv = await setupDock()
    act(() => {
      dv.addPanel({ id: 'shell', component: 'shell', position: { referencePanel: 'agent', direction: 'below' } })
    })
    await waitFor(() => expect(mounts.shell).toBe(1))
    expect(mounts.agent).toBe(1)

    const snapshots = { current: new Map<DockPanelId, SerializedDockview>() }
    act(() => { hidePanel(dv, 'shell', snapshots, makeRefs()) })

    // The agent panel must not have been torn down and remounted.
    await waitFor(() => expect(dv.getPanel('shell')).toBeUndefined())
    expect(mounts.agent).toBe(1)
  })

  it('opening a pane (showPanelFromHints) keeps the agent panel mounted', async () => {
    const dv = await setupDock()
    const refs = makeRefs()
    act(() => { showPanelFromHints(dv, 'shell', refs) })

    await waitFor(() => expect(dv.getPanel('shell')).toBeDefined())
    expect(mounts.agent).toBe(1)
  })

  it('a close-then-reopen cycle (showPanelFromSnapshot) keeps the agent panel mounted', async () => {
    const dv = await setupDock()
    act(() => {
      dv.addPanel({ id: 'shell', component: 'shell', position: { referencePanel: 'agent', direction: 'below' } })
    })
    await waitFor(() => expect(mounts.shell).toBe(1))

    const snapshot = dv.toJSON()
    const snapshots = { current: new Map<DockPanelId, SerializedDockview>() }
    act(() => { hidePanel(dv, 'shell', snapshots, makeRefs()) })
    await waitFor(() => expect(dv.getPanel('shell')).toBeUndefined())

    act(() => { showPanelFromSnapshot(dv, 'shell', snapshot, snapshots, makeRefs()) })
    await waitFor(() => expect(dv.getPanel('shell')).toBeDefined())

    // Agent stayed mounted across the entire hide + reopen cycle.
    expect(mounts.agent).toBe(1)
  })
})
