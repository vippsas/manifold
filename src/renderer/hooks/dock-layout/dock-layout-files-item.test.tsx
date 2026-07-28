// The files item is one card holding Files, Modified Files and the editor as
// tabs — but each is its own dockview panel, so a layout saved while they sat
// apart used to restore as several cards. These tests drive the REAL dockview
// library to pin that a fragmented arrangement heals into one group.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { coalesceFilesItem, ensureEditorTab } from './dock-layout-files-item'
import { loadOrBuildLayout } from './dock-layout-loader'

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

/** The fragmented shape 17 of 97 real saved layouts were found in: the files
 *  views tabbed together, the editor stranded in a column of its own. */
function addFragmentedLayout(api: DockviewApi): void {
  api.addPanel({ id: 'agent', component: 'agent' })
  api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
  api.addPanel({ id: 'modifiedFiles', component: 'modifiedFiles', position: { referencePanel: 'fileTree', direction: 'within' } })
  api.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'agent', direction: 'below' } })
}

describe('coalesceFilesItem', () => {
  it('pulls a stranded editor back into the files item', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => { addFragmentedLayout(api) })

    const filesGroup = api.getPanel('fileTree')?.group
    expect(api.getPanel('editor')?.group).not.toBe(filesGroup)

    let moved = false
    act(() => { moved = coalesceFilesItem(api) })

    expect(moved).toBe(true)
    expect(api.getPanel('editor')?.group).toBe(filesGroup)
    expect(api.getPanel('modifiedFiles')?.group).toBe(filesGroup)
    // The stranded pane's group is gone, not left behind empty.
    expect(api.groups.length).toBe(2)
  })

  it('leaves the agent and other panels where they are', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => { addFragmentedLayout(api) })

    const agentGroup = api.getPanel('agent')?.group
    act(() => { coalesceFilesItem(api) })

    expect(api.getPanel('agent')?.group).toBe(agentGroup)
  })

  it('reports no change when the item is already one card', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      api.addPanel({ id: 'agent', component: 'agent' })
      api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
      api.addPanel({ id: 'modifiedFiles', component: 'modifiedFiles', position: { referencePanel: 'fileTree', direction: 'within' } })
    })

    let moved = true
    act(() => { moved = coalesceFilesItem(api) })

    expect(moved).toBe(false)
  })

  it('reports no change when only one of the views is open', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      api.addPanel({ id: 'agent', component: 'agent' })
      api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
    })

    let moved = true
    act(() => { moved = coalesceFilesItem(api) })

    expect(moved).toBe(false)
  })

  it('heals a fragmented layout as it loads from disk', async () => {
    const source = await setupDock()
    act(() => { source.layout(1800, 1000, true) })
    act(() => { addFragmentedLayout(source) })
    const fragmented = source.toJSON()

    const saved: SerializedDockview[] = []
    const invoke = vi.fn(async (channel: string) => (channel === 'dock-layout:get' ? fragmented : null))
    ;(globalThis as unknown as { window: { electronAPI: unknown } }).window.electronAPI = {
      invoke: (channel: string, _sid: string, layout?: SerializedDockview) => {
        if (channel === 'dock-layout:set' && layout) saved.push(layout)
        return invoke(channel)
      },
    }

    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    await act(async () => {
      await loadOrBuildLayout(api, 'session-1', () => {}, {
        isRestoringRef: { current: false },
        lastLayoutRef: { current: null },
      })
    })

    expect(api.getPanel('editor')?.group).toBe(api.getPanel('fileTree')?.group)
    // The repair is persisted, so the split does not come back next load.
    expect(saved).toHaveLength(1)
  })

  it('keeps a split editor pane as its own pane', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      addFragmentedLayout(api)
      api.addPanel({ id: 'editor:1', component: 'editor', position: { referencePanel: 'agent', direction: 'below' } })
    })

    const splitGroup = api.getPanel('editor:1')?.group
    act(() => { coalesceFilesItem(api) })

    expect(api.getPanel('editor:1')?.group).toBe(splitGroup)
    expect(api.getPanel('editor:1')?.group).not.toBe(api.getPanel('fileTree')?.group)
  })
})

describe('ensureEditorTab', () => {
  it('gives an open files item its code-viewer tab without stealing focus', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      api.addPanel({ id: 'agent', component: 'agent' })
      api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
    })

    let added = false
    act(() => { added = ensureEditorTab(api) })

    expect(added).toBe(true)
    expect(api.getPanel('editor')?.group).toBe(api.getPanel('fileTree')?.group)
    // The item still shows the view that was asked for, not the empty viewer.
    expect(api.getPanel('fileTree')?.group.activePanel?.id).toBe('fileTree')
  })

  it('does nothing when the code viewer is already a tab', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      api.addPanel({ id: 'agent', component: 'agent' })
      api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
      api.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'fileTree', direction: 'within' } })
    })

    let added = true
    act(() => { added = ensureEditorTab(api) })

    expect(added).toBe(false)
    expect(api.panels.filter((panel) => panel.id === 'editor')).toHaveLength(1)
  })

  it('does not reopen a closed files item', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => { api.addPanel({ id: 'agent', component: 'agent' }) })

    let added = true
    act(() => { added = ensureEditorTab(api) })

    expect(added).toBe(false)
    expect(api.getPanel('editor')).toBeUndefined()
  })

  it('leaves the item at its sidebar width — widening waits for a real file', async () => {
    const api = await setupDock()
    act(() => { api.layout(1800, 1000, true) })
    act(() => {
      api.addPanel({ id: 'agent', component: 'agent' })
      api.addPanel({ id: 'fileTree', component: 'fileTree', position: { referencePanel: 'agent', direction: 'right' } })
    })
    const before = api.getPanel('fileTree')?.group.api.width

    act(() => { ensureEditorTab(api) })

    expect(api.getPanel('fileTree')?.group.api.width).toBe(before)
  })
})
