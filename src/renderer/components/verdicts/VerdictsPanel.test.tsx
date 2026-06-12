import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DockStateContext, type DockAppState } from '../editor/editor-shell/dock-panel-types'
import { VerdictsPanel } from './VerdictsPanel'
import type { VerdictRecord } from '../../../shared/verdict-types'

const mockInvoke = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke }
})

function renderWith(activeProjectId: string | null): void {
  const state = { activeProjectId } as DockAppState
  render(<DockStateContext.Provider value={state}><VerdictsPanel /></DockStateContext.Provider>)
}

function record(overrides: Partial<VerdictRecord>): VerdictRecord {
  return {
    sessionId: 's', projectId: 'p1', branch: 'b', runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' }, outcome: 'merged',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('VerdictsPanel', () => {
  it('shows empty state when there are no records', async () => {
    mockInvoke.mockResolvedValue([])
    renderWith('p1')
    await waitFor(() => expect(screen.getByText(/no sessions captured yet/i)).toBeTruthy())
  })

  it('shows empty state when no active project', () => {
    renderWith(null)
    expect(screen.getByText(/select a project/i)).toBeTruthy()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('renders per-runtime stats and recent sessions', async () => {
    mockInvoke.mockResolvedValue([
      record({ sessionId: 'a', runtime: 'claude', outcome: 'merged', createdAt: '2026-05-16T01:00:00Z' }),
      record({ sessionId: 'b', runtime: 'codex', outcome: 'discarded', createdAt: '2026-05-16T02:00:00Z', taskPrompt: { kind: 'full', text: 'fix bug' } }),
    ])
    renderWith('p1')
    await waitFor(() => expect(screen.getAllByText('claude').length).toBeGreaterThan(0))
    expect(screen.getAllByText('codex').length).toBeGreaterThan(0)
    expect(screen.getByText('fix bug')).toBeTruthy()
  })

  it('shows error message on IPC failure', async () => {
    mockInvoke.mockRejectedValue(new Error('boom'))
    renderWith('p1')
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy())
  })

  it('refresh button re-invokes IPC', async () => {
    mockInvoke.mockResolvedValue([])
    renderWith('p1')
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
  })

  it('renders prUrl as link when present', async () => {
    mockInvoke.mockResolvedValue([
      record({
        sessionId: 'p', outcome: 'pr_created',
        metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://github.com/o/r/pull/1' },
      }),
    ])
    renderWith('p1')
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /PR/i }) as HTMLAnchorElement
      expect(link.href).toBe('https://github.com/o/r/pull/1')
    })
  })

  it('renders per-session metric chips when activity is present', async () => {
    mockInvoke.mockResolvedValue([
      record({
        sessionId: 'm', outcome: 'committed_only',
        metrics: { agentCommits: 2, humanEdits: 7, diffLines: { added: 42, removed: 5 }, filesChanged: 3 },
      }),
    ])
    renderWith('p1')
    await waitFor(() => expect(screen.getByLabelText(/2 agent commits/)).toBeTruthy())
    expect(screen.getByLabelText(/7 human edits/)).toBeTruthy()
    expect(screen.getByLabelText(/3 files changed/)).toBeTruthy()
    expect(screen.getByLabelText(/42 lines added, 5 lines removed/)).toBeTruthy()
  })

  it('omits chips with zero value but keeps the others', async () => {
    mockInvoke.mockResolvedValue([
      record({
        sessionId: 'p', outcome: 'pr_created',
        metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://example/1' },
      }),
    ])
    renderWith('p1')
    await waitFor(() => expect(screen.getByLabelText(/1 agent commits/)).toBeTruthy())
    expect(screen.queryByLabelText(/human edits/)).toBeNull()
    expect(screen.queryByLabelText(/files changed/)).toBeNull()
    expect(screen.queryByLabelText(/lines added/)).toBeNull()
  })

  it('shows "no activity" placeholder when all metrics are zero', async () => {
    mockInvoke.mockResolvedValue([
      record({
        sessionId: 'z', outcome: 'discarded',
        metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
      }),
    ])
    renderWith('p1')
    await waitFor(() => expect(screen.getByLabelText(/no activity captured/i)).toBeTruthy())
  })
})
