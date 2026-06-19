import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { VerdictRecord, ProjectVerdicts } from 'manifold'
import { StatisticsPanel } from './StatisticsPanel'

function record(overrides: Partial<VerdictRecord>): VerdictRecord {
  return {
    sessionId: 's', projectId: 'p1', branch: 'b', runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' }, outcome: 'merged',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

/** Group flat records by projectId (name = "Repo <id>") the way the host would. */
function toGroups(records: VerdictRecord[]): ProjectVerdicts[] {
  const byId = new Map<string, VerdictRecord[]>()
  for (const r of records) { const b = byId.get(r.projectId) ?? []; b.push(r); byId.set(r.projectId, b) }
  return [...byId.entries()].map(([projectId, recs]) => ({ projectId, projectName: `Repo ${projectId}`, records: recs }))
}

/** Push a host `init` message the same way the renderer relays it into the iframe. */
const init = (records: VerdictRecord[], error: string | null = null): void => {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', groups: toGroups(records), error } })) })
}

describe('StatisticsPanel', () => {
  afterEach(() => cleanup())

  it('shows empty state when there are no records', () => {
    render(<StatisticsPanel />)
    init([])
    expect(screen.getByText(/no sessions captured yet/i)).toBeTruthy()
  })

  it('renders per-runtime stats and recent sessions', () => {
    render(<StatisticsPanel />)
    init([
      record({ sessionId: 'a', runtime: 'claude', outcome: 'merged', createdAt: '2026-05-16T01:00:00Z' }),
      record({ sessionId: 'b', runtime: 'codex', outcome: 'discarded', createdAt: '2026-05-16T02:00:00Z', taskPrompt: { kind: 'full', text: 'fix bug' } }),
    ])
    expect(screen.getAllByText('claude').length).toBeGreaterThan(0)
    expect(screen.getAllByText('codex').length).toBeGreaterThan(0)
    expect(screen.getByText('fix bug')).toBeTruthy()
  })

  it('renders a per-repo breakdown across all projects', () => {
    render(<StatisticsPanel />)
    init([
      record({ sessionId: 'a', projectId: 'alpha', outcome: 'merged' }),
      record({ sessionId: 'b', projectId: 'alpha', outcome: 'discarded' }),
      record({ sessionId: 'c', projectId: 'beta', outcome: 'merged' }),
    ])
    expect(screen.getByText(/^Per-repo/)).toBeTruthy()
    expect(screen.getByText('Repo alpha')).toBeTruthy()
    expect(screen.getByText('Repo beta')).toBeTruthy()
    // alpha has 2 sessions, beta 1 → both labels present
    expect(screen.getByText('2 sessions')).toBeTruthy()
    expect(screen.getByText('1 session')).toBeTruthy()
  })

  it('clicking a per-repo card filters the sections below to that repo, and clears on re-click', () => {
    render(<StatisticsPanel />)
    init([
      record({ sessionId: 'a', projectId: 'alpha', runtime: 'claude', outcome: 'merged', taskPrompt: { kind: 'full', text: 'alpha work' } }),
      record({ sessionId: 'b', projectId: 'beta', runtime: 'codex', outcome: 'merged', taskPrompt: { kind: 'full', text: 'beta work' } }),
    ])
    // Unfiltered: both sessions in the recent list.
    expect(screen.getByText('Recent sessions · 2')).toBeTruthy()
    expect(screen.getByText('alpha work')).toBeTruthy()
    expect(screen.getByText('beta work')).toBeTruthy()

    // Click the "Repo alpha" card → recent + per-runtime scope to alpha only.
    fireEvent.click(screen.getByRole('button', { name: /^Repo alpha/i }))
    expect(screen.getByText('Recent sessions · 1 · Repo alpha')).toBeTruthy()
    expect(screen.getByText('alpha work')).toBeTruthy()
    expect(screen.queryByText('beta work')).toBeNull()
    expect(screen.getByText('Per-runtime quality · Repo alpha')).toBeTruthy()

    // Click it again → filter clears, both sessions return.
    fireEvent.click(screen.getByRole('button', { name: /^Repo alpha/i }))
    expect(screen.getByText('Recent sessions · 2')).toBeTruthy()
    expect(screen.getByText('beta work')).toBeTruthy()
  })

  it('shows error message when init carries an error', () => {
    render(<StatisticsPanel />)
    init([], 'boom')
    expect(screen.getByText(/boom/)).toBeTruthy()
  })

  it('refresh button posts a refresh message to the host', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([]) // clears the busy state so the button is enabled
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(post).toHaveBeenCalledWith({ type: 'refresh' }, '*')
    post.mockRestore()
  })

  it('shows no Reset button until a repo is selected, then resets just that repo', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([
      record({ sessionId: 'a', projectId: 'alpha', outcome: 'merged' }),
      record({ sessionId: 'b', projectId: 'beta', outcome: 'merged' }),
    ])
    // No repo selected → no Reset button.
    expect(screen.queryByRole('button', { name: /^reset/i })).toBeNull()

    // Select alpha → a scoped "Reset Repo alpha" button appears.
    fireEvent.click(screen.getByRole('button', { name: /Repo alpha/i }))
    const resetBtn = screen.getByRole('button', { name: /Reset Repo alpha/i })
    fireEvent.click(resetBtn)
    expect(post).toHaveBeenCalledWith({ type: 'reset', projectId: 'alpha' }, '*')

    // Issuing the reset clears the selection (filter returns to all repos).
    expect(screen.queryByRole('button', { name: /^Reset/i })).toBeNull()
    post.mockRestore()
  })

  it('renders the outcome badge as one clickable PR link when prUrl present', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([record({
      sessionId: 'p', outcome: 'pr_created',
      metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://github.com/o/r/pull/1' },
    })])
    const badge = screen.getByRole('button', { name: /PR/i })
    fireEvent.click(badge)
    expect(post).toHaveBeenCalledWith({ type: 'open-external', url: 'https://github.com/o/r/pull/1' }, '*')
    post.mockRestore()
  })

  it('lists every session (no 50 cap) and shows the count in the header', () => {
    render(<StatisticsPanel />)
    const many = Array.from({ length: 60 }, (_, i) =>
      record({ sessionId: `s${i}`, createdAt: `2026-05-16T00:${String(i).padStart(2, '0')}:00Z` }),
    )
    init(many)
    expect(screen.getByText('Recent sessions · 60')).toBeTruthy()
    expect(screen.getAllByText('do the thing').length).toBe(60)
  })

  it('renders per-session metric chips when activity is present', () => {
    render(<StatisticsPanel />)
    init([record({
      sessionId: 'm', outcome: 'committed_only',
      metrics: { agentCommits: 2, humanEdits: 7, diffLines: { added: 42, removed: 5 }, filesChanged: 3 },
    })])
    expect(screen.getByLabelText(/2 agent commits/)).toBeTruthy()
    expect(screen.getByLabelText(/7 human edits/)).toBeTruthy()
    expect(screen.getByLabelText(/3 files changed/)).toBeTruthy()
    expect(screen.getByLabelText(/42 lines added, 5 lines removed/)).toBeTruthy()
  })

  it('shows "no activity" placeholder when all metrics are zero', () => {
    render(<StatisticsPanel />)
    init([record({
      sessionId: 'z', outcome: 'discarded',
      metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    })])
    expect(screen.getByLabelText(/no activity captured/i)).toBeTruthy()
  })
})
