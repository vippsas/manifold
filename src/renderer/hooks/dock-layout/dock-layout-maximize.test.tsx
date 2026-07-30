// Double-click-to-maximize (focus mode) for a pane's tab. Maximizing a group
// must fill the dock area, hide every other group AND both sidebars, and — most
// importantly — leave the panels mounted so the agent terminal is not destroyed
// or flashed. Exiting must restore every group to its prior visibility/width.
// These tests render the REAL dockview library and drive the REAL helper.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps } from 'dockview'
import { describe, it, expect, beforeAll } from 'vitest'
import { toggleMaximizedGroup } from './dock-layout-helpers'

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

/** Is a panel's group visible (its `.dv-view` wrapper carries the `visible` class
 *  that dockview toggles off when a sibling group is maximized)? */
function isGroupVisible(api: DockviewApi, panelId: string): boolean {
  const view = api.getPanel(panelId)?.group?.element.closest('.dv-view')
  return view?.classList.contains('visible') ?? false
}

/** Build projects | (agent / shell) | modifiedFiles — a center pane with a nested
 *  pane plus a left and a right sidebar, matching the real dock shape. */
async function setupDock(): Promise<DockviewApi> {
  mounts = {}
  let api: DockviewApi | null = null
  render(
    <div style={{ width: 1000, height: 700 }}>
      <DockviewReact
        components={{ agent: Probe, editor: Probe, shell: Probe, projects: Probe, modifiedFiles: Probe }}
        onReady={(e) => { api = e.api }}
      />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.addPanel({ id: 'projects', component: 'projects' })
    dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'projects', direction: 'right' } })
    dv.addPanel({ id: 'modifiedFiles', component: 'modifiedFiles', position: { referencePanel: 'agent', direction: 'right' } })
    dv.addPanel({ id: 'shell', component: 'shell', position: { referencePanel: 'agent', direction: 'below' } })
  })
  await waitFor(() => expect(mounts.agent).toBe(1))
  return dv
}

describe('toggleMaximizedGroup (double-click focus mode)', () => {
  it('maximizes the focused pane, hiding other panes and both sidebars', async () => {
    const dv = await setupDock()
    const events: boolean[] = []
    dv.onDidMaximizedGroupChange((e) => events.push(e.isMaximized))

    act(() => { toggleMaximizedGroup(dv, 'agent') })

    expect(dv.hasMaximizedGroup()).toBe(true)
    expect(events).toEqual([true])
    // Both sidebars and the other pane are hidden; only the focused pane shows.
    expect(isGroupVisible(dv, 'projects')).toBe(false)
    expect(isGroupVisible(dv, 'modifiedFiles')).toBe(false)
    expect(isGroupVisible(dv, 'shell')).toBe(false)
    expect(isGroupVisible(dv, 'agent')).toBe(true)
  })

  it('restores every pane and both sidebars on the second toggle', async () => {
    const dv = await setupDock()

    act(() => { toggleMaximizedGroup(dv, 'agent') })
    expect(dv.hasMaximizedGroup()).toBe(true)

    act(() => { toggleMaximizedGroup(dv, 'agent') })

    expect(dv.hasMaximizedGroup()).toBe(false)
    expect(isGroupVisible(dv, 'projects')).toBe(true)
    expect(isGroupVisible(dv, 'modifiedFiles')).toBe(true)
    expect(isGroupVisible(dv, 'shell')).toBe(true)
    expect(isGroupVisible(dv, 'agent')).toBe(true)
  })

  it('never remounts panels across a maximize/restore round-trip', async () => {
    const dv = await setupDock()
    expect(mounts).toMatchObject({ agent: 1, projects: 1, modifiedFiles: 1, shell: 1 })

    act(() => { toggleMaximizedGroup(dv, 'agent') })
    act(() => { toggleMaximizedGroup(dv, 'agent') })

    // No panel was torn down and remounted — the agent's xterm survives.
    expect(mounts).toMatchObject({ agent: 1, projects: 1, modifiedFiles: 1, shell: 1 })
  })

  it('is a no-op for an unknown panel id', async () => {
    const dv = await setupDock()
    act(() => { toggleMaximizedGroup(dv, 'does-not-exist') })
    expect(dv.hasMaximizedGroup()).toBe(false)
  })
})
