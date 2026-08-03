// A user upgrading from the old three-column model (Repositories | agent |
// Modified Files + editor) has that layout sitting in their store. None of
// those sidebar ids exist anymore, so restoring it verbatim would render an
// empty or broken dock. This drives the REAL hook against the REAL dockview
// library and pins what the user actually sees after the upgrade: the new
// sidebar beside their agent.
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

// Only the panels the new model registers — exactly what the app provides. A
// restored `projects` or `modifiedFiles` panel would have no component here,
// which is the "broken dock" this test exists to catch.
const COMPONENTS = { sidebar: Probe, agent: Probe, editor: Probe, shell: Probe }

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke, on: vi.fn(() => vi.fn()) }
})

/** The shape the old model saved: three columns, the editor tabbed into the
 *  Modified Files sidebar on the right. */
const OLD_SAVED_LAYOUT = {
  grid: {
    width: 1200,
    height: 800,
    orientation: 'HORIZONTAL',
    root: {
      type: 'branch',
      size: 1200,
      data: [
        { type: 'leaf', size: 200, data: { id: 'repos', views: ['projects'], activeView: 'projects' } },
        { type: 'leaf', size: 800, data: { id: 'workspace', views: ['agent'], activeView: 'agent' } },
        {
          type: 'leaf',
          size: 200,
          data: { id: 'files', views: ['modifiedFiles', 'editor'], activeView: 'modifiedFiles' },
        },
      ],
    },
  },
  panels: {
    projects: { id: 'projects', contentComponent: 'projects', title: 'Repositories' },
    agent: { id: 'agent', contentComponent: 'agent', title: 'Agent' },
    modifiedFiles: { id: 'modifiedFiles', contentComponent: 'modifiedFiles', title: 'Modified Files' },
    editor: { id: 'editor', contentComponent: 'editor', title: 'Editor' },
  },
} as unknown as SerializedDockview

function Harness(): React.JSX.Element {
  const dock = useDockLayout('session-1', [])
  return (
    <div style={{ width: 1200, height: 800 }}>
      <DockviewReact components={COMPONENTS} onReady={(e) => dock.onReady(e.api)} />
    </div>
  )
}

async function renderWithSavedLayout(saved: SerializedDockview | null): Promise<{ api: DockviewApi }> {
  let api: DockviewApi | null = null
  const Capture = (): React.JSX.Element => {
    const dock = useDockLayout('session-1', [])
    return (
      <div style={{ width: 1200, height: 800 }}>
        <DockviewReact
          components={COMPONENTS}
          onReady={(e) => { api = e.api; dock.onReady(e.api) }}
        />
      </div>
    )
  }
  mockInvoke.mockImplementation((channel: string) => (
    Promise.resolve(channel === 'dock-layout:get' ? saved : null)
  ))
  render(<Capture />)
  await waitFor(() => expect(api).not.toBeNull())
  await act(async () => { await Promise.resolve() })
  return { api: api as unknown as DockviewApi }
}

describe('upgrading from the old three-column dock layout', () => {
  it('renders the sidebar beside the agent', async () => {
    const { api } = await renderWithSavedLayout(OLD_SAVED_LAYOUT)

    await waitFor(() => expect(api.getPanel('sidebar')).toBeDefined())
    expect(api.getPanel('agent')).toBeDefined()
    // Each lands in a column of its own — the sidebar is never a tab of the
    // agent's group.
    expect(api.getPanel('sidebar')?.group).not.toBe(api.getPanel('agent')?.group)
  })

  it('restores none of the retired panels', async () => {
    const { api } = await renderWithSavedLayout(OLD_SAVED_LAYOUT)

    await waitFor(() => expect(api.getPanel('sidebar')).toBeDefined())
    for (const retired of ['projects', 'modifiedFiles', 'sourceControl']) {
      expect(api.getPanel(retired), `'${retired}' must not be restored`).toBeUndefined()
    }
  })

  it('leaves the dock non-empty and every panel renderable', async () => {
    const { api } = await renderWithSavedLayout(OLD_SAVED_LAYOUT)

    await waitFor(() => expect(api.panels.length).toBeGreaterThan(0))
    const registered = new Set(Object.keys(COMPONENTS))
    for (const panel of api.panels) {
      expect(registered.has(panel.id), `no component registered for '${panel.id}'`).toBe(true)
    }
  })

  it('persists the migrated layout so the old one is not read again', async () => {
    await renderWithSavedLayout(OLD_SAVED_LAYOUT)

    const saves = mockInvoke.mock.calls.filter(([channel]) => channel === 'dock-layout:set')
    expect(saves.length).toBeGreaterThan(0)
    const [, persisted] = saves[saves.length - 1] as [string, SerializedDockview]
    expect(Object.keys(persisted.panels).sort()).toEqual(['agent', 'sidebar'])
  })
})

// Keeps the harness import honest: the plain Harness is the same wiring the
// other dock tests use, exercised here with no saved layout at all.
describe('a first run with no saved layout', () => {
  it('builds the sidebar-and-agent default', async () => {
    mockInvoke.mockImplementation(() => Promise.resolve(null))
    const { container } = render(<Harness />)
    await waitFor(() => expect(container.querySelector('.dv-groupview')).not.toBeNull())
    await act(async () => { await Promise.resolve() })

    const tabs = [...container.querySelectorAll('.dv-tab')].map((tab) => tab.textContent)
    expect(tabs).toEqual(expect.arrayContaining(['Sidebar', 'Agent']))
  })
})
