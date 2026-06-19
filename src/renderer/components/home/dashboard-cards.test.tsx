import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { useWorktreesSummary, useVerdictsSummary, clearDashboardSummaryCache } from './dashboard-cards'

// The summary cache is module-level (persists for the app session) — reset it so
// each case starts cold and doesn't see a prior case's cached numbers.
beforeEach(() => clearDashboardSummaryCache())

function Probe(): React.JSX.Element {
  const s = useWorktreesSummary()
  return <div>{s.loading ? 'loading' : s.error ? 'error' : s.stats.map((x) => `${x.label}:${x.value}`).join(' ')}</div>
}

function VerdictsProbe(): React.JSX.Element {
  const s = useVerdictsSummary()
  return <div>{s.loading ? 'loading' : s.error ? 'error' : s.stats.map((x) => `${x.label}:${x.value}`).join(' ')}</div>
}

describe('useWorktreesSummary', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ worktrees: 5, cleanableBranches: 2, repos: 3 })), on: vi.fn(() => () => {}) }
  })

  it('maps the summary to labelled stats', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByText(/worktrees:5/)).toBeInTheDocument())
    expect(screen.getByText(/cleanable:2/)).toBeInTheDocument()
    expect(screen.getByText(/repos:3/)).toBeInTheDocument()
  })

  it('reports error when the fetch rejects and nothing is cached', async () => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => { throw new Error('boom') }), on: vi.fn(() => () => {}) }
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument())
  })

  it('serves cached numbers instantly on re-mount (no loading flash)', async () => {
    // First mount populates the cache.
    render(<Probe />)
    await waitFor(() => expect(screen.getByText(/worktrees:5/)).toBeInTheDocument())
    cleanup()

    // Re-mount: the cached numbers render synchronously — never a "loading" frame.
    render(<Probe />)
    expect(screen.getByText(/worktrees:5/)).toBeInTheDocument()
    expect(screen.queryByText('loading')).toBeNull()
  })

  it('keeps cached numbers when a background refresh fails', async () => {
    render(<Probe />)
    await waitFor(() => expect(screen.getByText(/worktrees:5/)).toBeInTheDocument())
    cleanup()

    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => { throw new Error('boom') }), on: vi.fn(() => () => {}) }
    render(<Probe />)
    // Stale numbers stay; no error surfaces because we have a cached fallback.
    await waitFor(() => expect(screen.getByText(/worktrees:5/)).toBeInTheDocument())
    expect(screen.queryByText('error')).toBeNull()
  })
})

describe('useVerdictsSummary', () => {
  beforeEach(() => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => ({ sessions: 58, mergedPct: 74, repos: 4 })), on: vi.fn(() => () => {}) }
  })

  it('maps the summary to labelled stats with a percent merge rate', async () => {
    render(<VerdictsProbe />)
    await waitFor(() => expect(screen.getByText(/sessions:58/)).toBeInTheDocument())
    expect(screen.getByText(/merged:74%/)).toBeInTheDocument()
    expect(screen.getByText(/repos:4/)).toBeInTheDocument()
  })
})
