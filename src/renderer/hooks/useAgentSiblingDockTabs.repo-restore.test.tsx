// Integration regression for #773: returning to a repo must restore the agent
// that was last *viewed*, not the one last *opened*. This wires the REAL
// useAgentSession (per-project active-session memory), useDockLayout (dock
// layout save/restore), and useAgentSiblingDockTabs (dock<->session sync) over
// the REAL dockview library, then reproduces the repo switch-away-and-back
// flow. The bug: on re-entry the dock layout reload re-activates the saved
// active panel and that activation overwrote the restored active session.
import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { DockviewReact, type DockviewApi, type IDockviewPanelProps, type SerializedDockview } from 'dockview'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { AgentSession } from '../../shared/types'
import { useAgentSession } from './useAgentSession'
import { useDockLayout } from './dock-layout/useDockLayout'
import { useAgentSiblingDockTabs } from './useAgentSiblingDockTabs'
import { getPrimarySession, siblingPanelId } from './agent-siblings'

beforeAll(() => {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
})

function Probe(props: IDockviewPanelProps): React.JSX.Element {
  return <div data-testid={`panel-${props.api.id}`}>{props.api.id}</div>
}

const COMPONENTS = {
  agent: Probe, editor: Probe, shell: Probe,
  projects: Probe, fileTree: Probe, modifiedFiles: Probe,
  pluginView: Probe, pluginTreeView: Probe,
}

function makeSession(id: string, projectId: string, worktreePath: string): AgentSession {
  return {
    id, projectId, runtimeId: 'codex',
    branchName: `manifold/${id}`, worktreePath,
    status: 'running', pid: 1234, additionalDirs: [],
  }
}

const SHARED_WT = '/wt/p1-shared'
const s1 = makeSession('s1', 'p1', SHARED_WT) // primary on shared worktree
const s2 = makeSession('s2', 'p1', SHARED_WT) // sibling on shared worktree
const s3 = makeSession('s3', 'p2', '/wt/p2')

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())
let layoutStore: Map<string, SerializedDockview>

beforeEach(() => {
  vi.clearAllMocks()
  layoutStore = new Map()
  mockInvoke.mockImplementation((channel: string, ...args: unknown[]) => {
    if (channel === 'agent:sessions') {
      const pid = args[0]
      if (pid === 'p1') return Promise.resolve([s1, s2])
      if (pid === 'p2') return Promise.resolve([s3])
      return Promise.resolve([])
    }
    if (channel === 'dock-layout:get') {
      return Promise.resolve(layoutStore.get(args[0] as string) ?? null)
    }
    if (channel === 'dock-layout:set') {
      layoutStore.set(args[0] as string, args[1] as SerializedDockview)
      return Promise.resolve()
    }
    return Promise.resolve(undefined)
  })
  window.electronAPI = {
    invoke: mockInvoke,
    send: vi.fn(),
    on: mockOn,
    getPathForFile: vi.fn(),
  }
})

interface Handle {
  setActiveSession: (id: string | null) => void
  activeSessionId: string | null
  api: DockviewApi | null
}

function Harness({ projectId, handle }: { projectId: string | null; handle: { current: Handle | null } }): React.JSX.Element {
  const { sessions, activeSessionId, activeSession, setActiveSession, rememberedActiveSessionRef } = useAgentSession(projectId)
  const activeWorktreePath = activeSession?.worktreePath ?? null
  const primarySessionId = getPrimarySession(sessions, activeWorktreePath)?.id ?? null
  const dockLayoutKey = primarySessionId ?? activeSessionId
  const dockLayout = useDockLayout(dockLayoutKey, sessions)
  useAgentSiblingDockTabs({
    apiRef: dockLayout.apiRef,
    layoutVersion: dockLayout.layoutVersion,
    layoutReloadVersion: dockLayout.layoutReloadVersion,
    isRestoringRef: dockLayout.isRestoringRef,
    rememberedActiveSessionRef,
    sessions,
    activeWorktreePath,
    primarySessionId,
    activeSessionId,
    onSelectSession: setActiveSession,
  })
  handle.current = { setActiveSession, activeSessionId, api: dockLayout.apiRef.current }
  return (
    <div style={{ width: 1200, height: 800 }}>
      <DockviewReact components={COMPONENTS} onReady={(e) => dockLayout.onReady(e.api)} />
    </div>
  )
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('repo re-entry restores the last viewed agent (#773)', () => {
  it('a dock layout reload on return does not overwrite the restored active session', async () => {
    const handle: { current: Handle | null } = { current: null }
    const { rerender } = render(<Harness projectId="p1" handle={handle} />)

    // Sessions load; first agent becomes active and the dock builds.
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('s1'))
    await waitFor(() => expect(handle.current?.api?.getPanel('agent')).toBeDefined())
    // The sibling tab for s2 is reconciled onto the shared worktree.
    await waitFor(() => expect(handle.current?.api?.getPanel(siblingPanelId('s2'))).toBeDefined())
    const api = handle.current!.api!

    // Open/select s2 (the last *opened* agent) via its dock tab.
    act(() => { api.getPanel(siblingPanelId('s2'))!.api.setActive() })
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('s2'))

    // Now make s1 the last *viewed* agent via the sidebar (primary row).
    act(() => { handle.current!.setActiveSession('s1') })
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('s1'))
    await flush()

    // Leave to another repo: this flushes p1's layout (with the s2 tab active)
    // to the saved-layout store keyed by p1's primary session id.
    rerender(<Harness projectId="p2" handle={handle} />)
    await waitFor(() => expect(handle.current?.activeSessionId).toBe('s3'))
    await flush()

    // Return to p1: useAgentSession restores s1, the dock reloads p1's saved
    // layout (s2 tab active). The reload must NOT re-select s2.
    rerender(<Harness projectId="p1" handle={handle} />)
    await waitFor(() => expect(handle.current?.api?.getPanel(siblingPanelId('s2'))).toBeDefined())
    await flush()
    await flush()

    // The restored active session is the last *viewed* agent, not the last
    // *opened* one, and the dock shows that agent (s1 = the primary tab).
    expect(handle.current?.activeSessionId).toBe('s1')
    expect(handle.current?.api?.activePanel?.id).toBe('agent')
  })

  it('a cold entry (no remembered session) still lets the saved dock layout drive selection', async () => {
    // Seed p1's saved dock layout with the s2 tab active, then leave to p2.
    const seed: { current: Handle | null } = { current: null }
    const first = render(<Harness projectId="p1" handle={seed} />)
    await waitFor(() => expect(seed.current?.api?.getPanel(siblingPanelId('s2'))).toBeDefined())
    act(() => { seed.current!.api!.getPanel(siblingPanelId('s2'))!.api.setActive() })
    await waitFor(() => expect(seed.current?.activeSessionId).toBe('s2'))
    first.rerender(<Harness projectId="p2" handle={seed} />)
    await waitFor(() => expect(seed.current?.activeSessionId).toBe('s3'))
    await flush()
    // Drop this session's in-memory per-project history (simulates an app restart
    // where only the dock layout — not the active agent — is persisted).
    first.unmount()

    const handle: { current: Handle | null } = { current: null }
    render(<Harness projectId="p1" handle={handle} />)
    await waitFor(() => expect(handle.current?.api?.getPanel(siblingPanelId('s2'))).toBeDefined())
    await flush()
    await flush()

    // With no remembered agent, the dock's restored active tab (s2) drives the
    // selection, exactly as before the #773 fix — the fix is scoped to re-entry.
    expect(handle.current?.activeSessionId).toBe('s2')
  })
})
