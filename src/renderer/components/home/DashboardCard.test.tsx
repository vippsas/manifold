import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardCard } from './DashboardCard'
import type { DashboardCardDef } from './dashboard-cards'

const card: DashboardCardDef = {
  id: 'x', title: 'Worktrees', icon: '⎇', fullViewId: 'v',
  useSummary: () => ({ loading: false, error: false, stats: [{ label: 'worktrees', value: 5 }] }),
}

describe('DashboardCard', () => {
  it('renders title + stats and fires onOpen on click', () => {
    const onOpen = vi.fn()
    render(<DashboardCard card={card} onOpen={onOpen} />)
    expect(screen.getByText('Worktrees')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('worktrees')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('shows a placeholder while loading', () => {
    const loading: DashboardCardDef = { ...card, useSummary: () => ({ loading: true, error: false, stats: [] }) }
    render(<DashboardCard card={loading} onOpen={vi.fn()} />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
