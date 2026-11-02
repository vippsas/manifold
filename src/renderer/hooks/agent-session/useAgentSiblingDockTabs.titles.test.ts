import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DockviewApi } from 'dockview'
import type { AgentSession } from '../../../shared/types'
import { siblingPanelId } from './agent-siblings'
import { useAgentSiblingDockTabs } from './useAgentSiblingDockTabs'

function agent(id: string, runtimeId: string, displayName?: string): AgentSession {
  return {
    id, projectId: 'p1', runtimeId, branchName: 'manifold/main', worktreePath: '/wt',
    status: 'running', pid: 1, additionalDirs: [], ...(displayName ? { displayName } : {}),
  }
}

/** A dock with the primary tab plus a tab per sibling id, recording every title set. */
function dockWith(siblingIds: string[]) {
  const titles = new Map<string, string>()
  const panelFor = (id: string) => ({
    id, title: id, group: { element: { getBoundingClientRect: () => ({ top: 0, left: 0 }) }, panels: [] },
    api: { isActive: false, setActive: vi.fn(), setTitle: vi.fn((t: string) => { titles.set(id, t) }) },
  })
  const panels = new Map([['agent', panelFor('agent')], ...siblingIds.map((s) => [siblingPanelId(s), panelFor(siblingPanelId(s))] as const)])
  const api = {
    getPanel: ((id: string) => panels.get(id)) as DockviewApi['getPanel'],
    addPanel: vi.fn(),
    onDidActivePanelChange: (() => ({ dispose() {} })) as DockviewApi['onDidActivePanelChange'],
  } as unknown as DockviewApi
  Object.defineProperty(api, 'panels', { get: () => Array.from(panels.values()) })
  return { api, titles }
}

describe('useAgentSiblingDockTabs — distinct default titles', () => {
  it('numbers unnamed agents of one runtime so no two tabs read alike', () => {
    const { api, titles } = dockWith(['b', 'c'])
    const sessions = [agent('a', 'codex'), agent('b', 'codex'), agent('c', 'codex')]

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api }, layoutVersion: 1, sessions, activeWorktreePath: '/wt',
      primarySessionId: 'a', activeSessionId: 'a', onSelectSession: vi.fn(),
    }))

    expect(titles.get('agent')).toBe('Codex')
    expect(titles.get(siblingPanelId('b'))).toBe('Codex 2')
    expect(titles.get(siblingPanelId('c'))).toBe('Codex 3')
  })

  it('does not rename an agent that already has a name', () => {
    const { api, titles } = dockWith(['b'])
    const sessions = [agent('a', 'codex'), agent('b', 'codex', 'Codex')]

    renderHook(() => useAgentSiblingDockTabs({
      apiRef: { current: api }, layoutVersion: 1, sessions, activeWorktreePath: '/wt',
      primarySessionId: 'a', activeSessionId: 'a', onSelectSession: vi.fn(),
    }))

    expect(titles.get(siblingPanelId('b'))).toBe('Codex')
    expect(titles.get('agent')).toBe('Codex 2')
  })
})
