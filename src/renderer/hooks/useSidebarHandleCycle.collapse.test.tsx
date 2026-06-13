// Covers the header collapse button's width mechanics: collapsing a sidebar to
// width 0 (remembering its pre-collapse width) and restoring it to exactly that
// width, while the opposite sidebar is preserved. Mirrors the real-dockview
// harness in dock-layout-drag-restore.test.tsx (jsdom has no layout engine, so
// element.offsetWidth is wired to dockview's tracked group width).
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { applySidebarWidth, collapseSidebar } from './useSidebarHandleCycle'

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

describe('collapseSidebar / applySidebarWidth', () => {
  it('collapses the projects sidebar to 0 and restores its previous width', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('projects')).toBe(200)

    let previous = 0
    act(() => { previous = collapseSidebar(dv, 'left') })
    expect(previous).toBe(200)
    expect(widthOf('projects')).toBe(0)
    // The opposite sidebar is preserved — only the center pane absorbs the space.
    expect(widthOf('fileTree')).toBe(200)

    act(() => { applySidebarWidth(dv, 'left', previous) })
    expect(widthOf('projects')).toBe(200)
    expect(widthOf('fileTree')).toBe(200)
  })

  it('collapses the file-tree sidebar to 0 and restores its previous width', async () => {
    const dv = await setupDock()
    const widthOf = (panelId: string): number => dv.getPanel(panelId)?.group.api.width ?? -1

    expect(widthOf('fileTree')).toBe(200)

    let previous = 0
    act(() => { previous = collapseSidebar(dv, 'right') })
    expect(previous).toBe(200)
    expect(widthOf('fileTree')).toBe(0)
    expect(widthOf('projects')).toBe(200)

    act(() => { applySidebarWidth(dv, 'right', previous) })
    expect(widthOf('fileTree')).toBe(200)
    expect(widthOf('projects')).toBe(200)
  })
})
