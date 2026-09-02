import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViolaRun, ViolaTaskRun } from '../../../shared/viola'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { ViolaRunBoard } from './ViolaRunBoard'

const NOW = 1_000_000

function task(over: Partial<ViolaTaskRun> = {}): ViolaTaskRun {
  return {
    id: 'api', title: 'API tests', description: 'd', acceptance: ['a'],
    purpose: 'implement', gates: [], state: 'implementing', stateSince: NOW - 90_000,
    runtimeId: 'claude', sessionId: 'child-1',
    ...over,
  }
}

function run(tasks: ViolaTaskRun[], state: ViolaRun['state'] = 'running'): ViolaRun {
  return {
    id: 'viola-1', baseSessionId: 's1', goal: 'g', summary: 'sum', state,
    availableRuntimes: ['claude', 'codex'], createdAt: NOW - 120_000, tasks,
  }
}

function renderBoard(value: ViolaRun | undefined, onOpenSibling = vi.fn()) {
  render(
    <DockStateContext.Provider value={{ onOpenSibling } as never}>
      <ViolaRunBoard run={value} />
    </DockStateContext.Provider>,
  )
  return { onOpenSibling }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ViolaRunBoard', () => {
  it('shows each task with its worker, step, and how long that step has run', () => {
    renderBoard(run([
      task(),
      task({ id: 'ui', title: 'UI state', state: 'reviewing', runtimeId: 'codex', reviewRuntimeId: 'claude', stateSince: NOW - 5_000 }),
    ]))

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('API tests')
    expect(rows[0].textContent).toContain('implementing')
    expect(rows[0].textContent).toContain('claude')
    expect(rows[0].textContent).toContain('1m 30s')
    // A reviewing task names the harness doing the review, not the one that built it.
    expect(rows[1].textContent).toContain('reviewing')
    expect(rows[1].textContent).toContain('claude')
    expect(rows[1].textContent).toContain('5s')
  })

  it('keeps counting while nothing else changes, which is what proves the run is alive', () => {
    renderBoard(run([task({ stateSince: NOW })]))
    expect(screen.getByRole('listitem').textContent).toContain('0s')

    act(() => { vi.advanceTimersByTime(3_000) })

    expect(screen.getByRole('listitem').textContent).toContain('3s')
  })

  it('opens a worker\'s own session when its row is clicked', () => {
    const { onOpenSibling } = renderBoard(run([task()]))

    fireEvent.click(screen.getByRole('listitem').querySelector('button')!)

    expect(onOpenSibling).toHaveBeenCalledWith('child-1', 'API tests')
  })

  it('does not offer a click target for a task that has no session yet', () => {
    renderBoard(run([task({ state: 'spawning', sessionId: undefined })]))

    expect(screen.getByRole('listitem').querySelector('button')).toBeNull()
    expect(screen.getByRole('listitem').textContent).toContain('starting')
  })

  it('says what a fixing task is fixing, since that no longer appears in the chat log', () => {
    renderBoard(run([task({
      state: 'fixing',
      reviewRuntimeId: 'codex',
      review: { passed: false, blocking: ['Restore drops the remembered panel.'], nonBlocking: [] },
    })]))

    const row = screen.getByRole('listitem')
    expect(row.textContent).toContain('fixing')
    expect(row.textContent).toContain('Restore drops the remembered panel.')
  })

  it('renders nothing when there is no run to show', () => {
    const { container } = render(<ViolaRunBoard run={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing once the run is no longer live, leaving the summary to the chat log', () => {
    const { container } = render(<ViolaRunBoard run={run([task({ state: 'done' })], 'complete')} />)
    expect(container.firstChild).toBeNull()
  })

  it('reports a failing step in place rather than dropping the row', () => {
    renderBoard(run([task({ state: 'needs_attention', error: 'Gate still failing: npm test' })]))

    const row = screen.getByRole('listitem')
    expect(row.textContent).toContain('needs attention')
    expect(row.textContent).toContain('Gate still failing: npm test')
  })
})
