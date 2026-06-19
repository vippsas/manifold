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

  it('renders prUrl as a link when present', () => {
    render(<StatisticsPanel />)
    init([record({
      sessionId: 'p', outcome: 'pr_created',
      metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://github.com/o/r/pull/1' },
    })])
    const link = screen.getByRole('link', { name: /PR/i }) as HTMLAnchorElement
    expect(link.href).toBe('https://github.com/o/r/pull/1')
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
