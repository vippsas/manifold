import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import type { VerdictRecord } from 'manifold'
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

/** Push a host `init` message the same way the renderer relays it into the iframe. */
const init = (records: VerdictRecord[], projectId: string | null = 'p1', error: string | null = null): void => {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'init', records, projectId, error } })) })
}

describe('StatisticsPanel', () => {
  afterEach(() => cleanup())

  it('shows empty state when there are no records', () => {
    render(<StatisticsPanel />)
    init([])
    expect(screen.getByText(/no sessions captured yet/i)).toBeTruthy()
  })

  it('shows empty state when no active project', () => {
    render(<StatisticsPanel />)
    init([], null)
    expect(screen.getByText(/select a project/i)).toBeTruthy()
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

  it('shows error message when init carries an error', () => {
    render(<StatisticsPanel />)
    init([], 'p1', 'boom')
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

  it('renders the outcome badge as one clickable PR link when prUrl present', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([record({
      sessionId: 'p', outcome: 'pr_created',
      metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://github.com/o/r/pull/1' },
    })])
    // A single badge — the status IS the link — and clicking it asks the host to open the PR.
    const badge = screen.getByRole('button', { name: /PR/i })
    fireEvent.click(badge)
    expect(post).toHaveBeenCalledWith({ type: 'open-external', url: 'https://github.com/o/r/pull/1' }, '*')
    post.mockRestore()
  })

  it('renders a non-interactive status chip when there is no prUrl', () => {
    render(<StatisticsPanel />)
    init([record({ sessionId: 'm', outcome: 'merged' })])
    // The only buttons are the header controls — the merged badge is a plain chip, not a link.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reset', 'Refresh'])
  })

  it('lists every session (no 50 cap) and shows the count in the header', () => {
    render(<StatisticsPanel />)
    const many = Array.from({ length: 60 }, (_, i) =>
      record({ sessionId: `s${i}`, createdAt: `2026-05-16T00:${String(i).padStart(2, '0')}:00Z` }),
    )
    init(many)
    expect(screen.getByText('Recent sessions · 60')).toBeTruthy()
    // All 60 rows render — the prompt preview appears once per row.
    expect(screen.getAllByText('do the thing').length).toBe(60)
  })

  it('reset button is disabled with no sessions and posts a reset message otherwise', () => {
    const post = vi.spyOn(window, 'postMessage')
    render(<StatisticsPanel />)
    init([]) // no records → nothing to reset
    expect((screen.getByRole('button', { name: /reset/i }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    render(<StatisticsPanel />)
    init([record({ sessionId: 'a' })])
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    expect(post).toHaveBeenCalledWith({ type: 'reset' }, '*')
    post.mockRestore()
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
