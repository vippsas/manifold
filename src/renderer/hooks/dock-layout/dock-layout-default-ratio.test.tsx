// Regression guard for #803: a new agent's default dock layout must always
// give each sidebar ~1/6 of the width. applyDefaultLayout's ratio patch
// used to assume the columns sit directly under the grid root — untrue when
// the previous layout left the grid root VERTICAL (a pane was docked at the
// bottom edge) or when the dock is still unmeasured — and silently no-oped,
// leaving equal-width columns. These tests render the REAL dockview library
// and drive the REAL builder.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { applyDefaultLayout } from './dock-layout-builders'

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

const COMPONENTS = {
  agent: Probe, editor: Probe, shell: Probe,
  projects: Probe, fileTree: Probe, modifiedFiles: Probe,
}

async function setupDock(): Promise<DockviewApi> {
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1800, height: 1000 }}>
      <DockviewReact components={COMPONENTS} onReady={(e) => { api = e.api }} />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  return api as unknown as DockviewApi
}

interface Node { type: string; size: number; data: Node[] | { views: string[] } }

function leafSize(node: Node, view: string): number | null {
  if (node.type === 'leaf') {
    return (node.data as { views: string[] }).views.includes(view) ? node.size : null
  }
  for (const child of node.data as Node[]) {
    const found = leafSize(child, view)
    if (found !== null) return found
  }
  return null
}

function columnWidths(api: DockviewApi): { projects: number; agent: number; files: number } {
  const root = api.toJSON().grid.root as unknown as Node
  return {
    projects: leafSize(root, 'projects') ?? -1,
    agent: leafSize(root, 'agent') ?? -1,
    files: leafSize(root, 'fileTree') ?? -1,
  }
}

describe('applyDefaultLayout sidebar ratio (#803)', () => {
  it('keeps the 1:4:1 ratio when the grid root was left VERTICAL by a bottom pane', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })

    // The previously shown agent's layout has a pane docked at the bottom
    // edge, so the live grid root is VERTICAL (restoring such a saved layout
    // via fromJSON sets the same orientation).
    act(() => { applyDefaultLayout(api) })
    act(() => { api.addPanel({ id: 'shell', component: 'shell', position: { direction: 'below' } }) })

    // A new agent has no saved layout: loadOrBuildLayout clears and rebuilds
    // the default. api.clear() does NOT reset the grid orientation, so the
    // columns nest inside a single wrapper branch under the VERTICAL root —
    // where the ratio patch used to miss them.
    act(() => { api.clear() })
    act(() => { applyDefaultLayout(api) })

    const widths = columnWidths(api)
    expect(widths.projects).toBeCloseTo(300, -1)
    expect(widths.files).toBe(widths.projects) // its own column, same share
    expect(widths.agent).toBeCloseTo(1200, -1)
  })

  // Pins currently-good behavior: the loader builds the default layout after
  // an async IPC await, so an unmeasured dock at build time is plausible. This
  // guard catches a dockview upgrade or builder edit making it ratio-lossy.
  it('keeps the 1:4:1 ratio when built before the dock is measured (width 0)', async () => {
    const api = await setupDock() // jsdom never lays out: api.width === 0
    act(() => { applyDefaultLayout(api) })

    // The first real measurement arrives only after the build.
    act(() => { api.layout(1800, 1000, true) })

    const widths = columnWidths(api)
    expect(widths.projects).toBeCloseTo(300, -1)
    expect(widths.files).toBe(widths.projects) // its own column, same share
    expect(widths.agent).toBeCloseTo(1200, -1)
  })

  it('never puts Repositories in the same group as the files item', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => { applyDefaultLayout(api) })

    const filesGroup = api.getPanel('fileTree')?.group
    expect(api.getPanel('modifiedFiles')?.group).toBe(filesGroup)
    expect(api.getPanel('projects')?.group).not.toBe(filesGroup)
  })
})
