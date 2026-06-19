import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useWorktreesSummary } from './dashboard-cards'

function Probe(): React.JSX.Element {
  const s = useWorktreesSummary()
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

  it('reports error when the fetch rejects', async () => {
    // @ts-expect-error test stub
    global.window.electronAPI = { invoke: vi.fn(async () => { throw new Error('boom') }), on: vi.fn(() => () => {}) }
    render(<Probe />)
    await waitFor(() => expect(screen.getByText('error')).toBeInTheDocument())
  })
})
