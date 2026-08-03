// The dock layout belongs to the window, not to the selected agent. Layouts
// used to be saved per session and restored on every switch, so clicking
// another agent replayed api.fromJSON: panels that agent had closed vanished,
// pane sizes jumped, the sidebars lost a few pixels each time, and every panel
// remounted. These tests drive the REAL dockview library through the real hook
// and pin that a session switch leaves the dock untouched.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { useDockLayout } from './useDockLayout'

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

const COMPONENTS = { agent: Probe, editor: Probe, shell: Probe, sidebar: Probe }

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(null)
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke, on: vi.fn(() => vi.fn()) }
})

/** A saved layout with a shell pane and hand-set sidebar widths — the shape one
 *  agent might have been left in. */
async function buildSavedLayout(): Promise<SerializedDockview> {
  let api: DockviewApi | null = null
  const view = render(
    <div style={{ width: 1200, height: 800 }}>
      <DockviewReact components={COMPONENTS} onReady={(e) => { api = e.api }} />
    </div>,
  )
  await waitFor(() => expect(api).not.toBeNull())
  const dv = api as unknown as DockviewApi
  act(() => {
    dv.layout(1200, 800, true)
    dv.addPanel({ id: 'sidebar', component: 'sidebar' })
    dv.addPanel({ id: 'agent', component: 'agent', position: { referencePanel: 'sidebar', direction: 'right' } })
    dv.addPanel({ id: 'editor', component: 'editor', position: { referencePanel: 'agent', direction: 'right' } })
    dv.addPanel({ id: 'shell', component: 'shell', position: { referencePanel: 'agent', direction: 'below' } })
    dv.getPanel('sidebar')?.group.api.setSize({ width: 260 })
  })
  const saved = dv.toJSON()
  view.unmount()
  return saved
}

function Harness({ sessionId }: { sessionId: string | null }): React.JSX.Element {
  const dock = useDockLayout(sessionId, [])
  return (
    <div style={{ width: 1200, height: 800 }}>
      <DockviewReact components={COMPONENTS} onReady={(e) => dock.onReady(e.api)} />
    </div>
  )
}

/** Panel ids plus each group's size — everything a user would see move. */
function shapeOf(container: HTMLElement): string {
  const groups = [...container.querySelectorAll('.dv-groupview')].map((group) => {
    const tabs = [...group.querySelectorAll('.dv-tab')].map((tab) => tab.textContent).join('+')
    const el = group as HTMLElement
    return `${tabs}@${el.style.width || '?'}x${el.style.height || '?'}`
  })
  return groups.sort().join(' | ')
}

describe('dock layout across a session switch', () => {
  it('leaves the panels and their sizes exactly as they were', async () => {
    const saved = await buildSavedLayout()
    mockInvoke.mockImplementation((channel: string) => (
      Promise.resolve(channel === 'dock-layout:get' ? saved : null)
    ))

    const { container, rerender } = render(<Harness sessionId="session-1" />)
    await waitFor(() => expect(container.querySelector('.dv-groupview')).not.toBeNull())
    await act(async () => { await Promise.resolve() })

    const before = shapeOf(container)
    expect(before).toContain('shell')

    await act(async () => { rerender(<Harness sessionId="session-2" />) })

    expect(shapeOf(container)).toBe(before)
  })

  it('reads the saved layout once, however many agents are visited', async () => {
    const saved = await buildSavedLayout()
    mockInvoke.mockImplementation((channel: string) => (
      Promise.resolve(channel === 'dock-layout:get' ? saved : null)
    ))

    const { container, rerender } = render(<Harness sessionId="session-1" />)
    await waitFor(() => expect(container.querySelector('.dv-groupview')).not.toBeNull())

    for (const sessionId of ['session-2', 'session-3', 'session-1']) {
      await act(async () => { rerender(<Harness sessionId={sessionId} />) })
    }

    const loads = mockInvoke.mock.calls.filter(([channel]) => channel === 'dock-layout:get')
    expect(loads).toHaveLength(1)
  })

  // A two-column `sidebar | agent` layout used to be the "minimal" empty state
  // that the first agent's arrival rebuilt into a wider workspace. It is now
  // simply the default, so it must restore untouched — arriving at an agent
  // must not rearrange a dock the user has been working in.
  it('restores a saved sidebar-and-agent layout as-is when an agent arrives', async () => {
    const { container, rerender } = render(<Harness sessionId={null} />)
    await waitFor(() => expect(container.querySelector('.dv-groupview')).not.toBeNull())
    await act(async () => { await Promise.resolve() })

    const before = shapeOf(container)
    expect(before).toContain('Sidebar')
    expect(before).toContain('Agent')

    await act(async () => { rerender(<Harness sessionId="session-1" />) })

    expect(shapeOf(container)).toBe(before)
  })
})
