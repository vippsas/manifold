// Files and the editor are intertwined, so they share one tabbed group:
// whichever opens second tabs into the group of the one already open. When the
// editor joins the sidebar-width files group, the shared group widens to an
// editable share; when the last editor pane leaves, it shrinks back to the
// default sidebar share.
//
// These tests render the REAL dockview library and drive the real
// showPanelFromHints / shrinkEditorHostSidebarGroups paths.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import {
  showPanelFromHints,
  shrinkEditorHostSidebarGroups,
  withPinnedSidebars,
} from './dock-layout-helpers'

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

async function setupDock(build: (api: DockviewApi) => void): Promise<DockviewApi> {
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1200, height: 700 }}>
      <DockviewReact
        components={{ projects: Probe, agent: Probe, editor: Probe, modifiedFiles: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.layout(1200, 700)
    build(dv)
  })
  return dv
}

/** The default 1:4:1 layout: projects | agent | the files item. */
function buildDefaultColumns(dv: DockviewApi): void {
  dv.addPanel({ id: 'projects', component: 'projects' })
  dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'projects', direction: 'right' } })
  dv.addPanel({ id: 'modifiedFiles', component: 'modifiedFiles', position: { referencePanel: 'agent', direction: 'right' } })
  dv.getPanel('projects')?.group.api.setSize({ width: 200 })
  dv.getPanel('modifiedFiles')?.group.api.setSize({ width: 200 })
}

describe('files and editor sharing one tabbed group', () => {
  it('opens the editor as a tab in the files group and widens the shared group', async () => {
    const dv = await setupDock(buildDefaultColumns)

    act(() => {
      showPanelFromHints(dv, 'editor')
    })

    const editorGroup = dv.getPanel('editor')?.group
    expect(editorGroup).toBe(dv.getPanel('modifiedFiles')?.group)
    // The shared group is no longer a sidebar sliver — it widened to an
    // editable share of the dock.
    expect(editorGroup?.api.width ?? 0).toBeGreaterThanOrEqual(1200 / 4)
    // The agent pane paid for it, not the left sidebar.
    expect(dv.getPanel('projects')?.group.api.width ?? 0).toBeLessThanOrEqual(210)
  })

  it('reopens files as a tab in the editor group without shrinking it', async () => {
    const dv = await setupDock((api) => {
      api.addPanel({ id: 'projects', component: 'projects' })
      api.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'projects', direction: 'right' } })
      api.getPanel('projects')?.group.api.setSize({ width: 200 })
    })
    act(() => {
      showPanelFromHints(dv, 'editor')
    })
    const editorGroup = dv.getPanel('editor')?.group
    const editorWidthBefore = editorGroup?.api.width ?? 0
    expect(editorWidthBefore).toBeGreaterThan(210)

    act(() => {
      showPanelFromHints(dv, 'modifiedFiles')
    })

    // The changes view tabbed into the editor's group and adopted its width — it did not
    // carve out a new column or clamp the shared group to sidebar width.
    expect(dv.getPanel('modifiedFiles')?.group).toBe(editorGroup)
    expect(editorGroup?.api.width ?? 0).toBe(editorWidthBefore)
  })

  it('shrinks the shared group back to sidebar share when the editor closes', async () => {
    const dv = await setupDock(buildDefaultColumns)
    act(() => {
      showPanelFromHints(dv, 'editor')
    })
    const sharedGroup = dv.getPanel('editor')?.group
    expect(sharedGroup?.api.width ?? 0).toBeGreaterThanOrEqual(1200 / 4)

    act(() => {
      const panel = dv.getPanel('editor')
      if (!panel) throw new Error('editor panel missing')
      withPinnedSidebars(dv, () => dv.removePanel(panel))
      shrinkEditorHostSidebarGroups(dv, new Set([sharedGroup]))
    })

    // Only the changes view remains in the group — a plain sidebar again.
    expect(dv.getPanel('modifiedFiles')?.group.api.width ?? 0).toBeLessThanOrEqual(210)
  })
})
