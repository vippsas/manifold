import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AgentTabUsage } from './AgentTabUsage'
import type { SessionCostSummary } from '../../shared/types'

const invoke = vi.fn()

function summary(over: Partial<SessionCostSummary> = {}): SessionCostSummary {
  return {
    tokenUsage: { inputTokens: 1_000_000, outputTokens: 200_000, cacheReadTokens: 0, cacheCreationTokens: 0 },
    turns: 47,
    costUsd: 3.41,
    unpricedModels: [],
    byModel: [{ model: 'Opus 5', inputTokens: 1_000_000, outputTokens: 200_000, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 3.41 }],
    contextTokens: 42_455,
    ...over,
  }
}

const icon = (): HTMLElement => screen.getByLabelText('Session cost')
const bubble = async (): Promise<HTMLElement> => screen.findByRole('tooltip', {}, { timeout: 2000 })

beforeEach(() => {
  invoke.mockReset()
  ;(window as unknown as { electronAPI: { invoke: typeof invoke } }).electronAPI = { invoke }
})

describe('AgentTabUsage', () => {
  it('costs nothing until the pointer arrives', () => {
    render(<AgentTabUsage sessionId="s1" />)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reads the session usage when hovered', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('agent:session-usage', 's1'))
  })

  it('leads with the estimated cost and backs it with tokens and turns', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('$3.41'))
    expect(tip.textContent).toContain('1.2M billed')
    expect(tip.textContent).toContain('47 turns')
  })

  it('breaks the session down per model, with where each one spent its tokens', async () => {
    // The real shape that made a one-word prompt look like a counting bug: two
    // tokens typed, and tens of thousands of cache traffic behind them.
    invoke.mockResolvedValue(summary({
      tokenUsage: { inputTokens: 12, outputTokens: 170, cacheReadTokens: 14_299, cacheCreationTokens: 47_357 },
      turns: 4,
      costUsd: 0.2308,
      byModel: [
        { model: 'Opus 5', inputTokens: 2, outputTokens: 43, cacheReadTokens: 14_299, cacheWriteTokens: 15_901, costUsd: 0.1672 },
        { model: 'Haiku 4.5', inputTokens: 10, outputTokens: 127, cacheReadTokens: 0, cacheWriteTokens: 31_456, costUsd: 0.0636 },
      ],
    }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('Opus 5'))
    expect(tip.textContent).toContain('Haiku 4.5')
    // Each row shows the four billing categories, so a big total explains itself.
    expect(tip.textContent).toContain('14.3k')   // Opus cache read
    expect(tip.textContent).toContain('31.5k')   // Haiku cache write
    expect(tip.textContent).toContain('$0.17')   // per-model cost
    expect(tip.textContent).toContain('$0.06')
  })

  it('separates cumulative billed tokens from the live context size', async () => {
    // Real shape: 103.9k billed across 3 requests, but only 42.5k in context —
    // reporting one number for both is what made the total look wrong.
    invoke.mockResolvedValue(summary({
      tokenUsage: { inputTokens: 22, outputTokens: 652, cacheReadTokens: 69_630, cacheCreationTokens: 33_547 },
      contextTokens: 42_455,
      turns: 3,
    }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('103.9k billed'))
    expect(tip.textContent).toContain('42.5k context')
    expect(tip.textContent).toContain('3 turns')
  })

  it('labels the breakdown columns so the numbers are not bare', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('In'))
    expect(tip.textContent).toContain('Out')
    expect(tip.textContent).toContain('Cache r')
    expect(tip.textContent).toContain('Cache w')
  })

  it('shows a dash rather than a price for a model it cannot price', async () => {
    invoke.mockResolvedValue(summary({
      costUsd: null,
      unpricedModels: ['claude-mystery-9'],
      byModel: [{ model: 'claude-mystery-9', inputTokens: 5, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null }],
    }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('claude-mystery-9'))
    expect(tip.textContent).toContain('Cost unavailable')
  })

  it('marks the figure as an estimate at API rates rather than money spent', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('API rates'))
  })

  it('says the cost is unavailable rather than inventing one for an unknown model', async () => {
    invoke.mockResolvedValue(summary({
      costUsd: null,
      unpricedModels: ['claude-mystery-9'],
      byModel: [{ model: 'claude-mystery-9', inputTokens: 5, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: null }],
    }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('Cost unavailable'))
    expect(tip.textContent).toContain('claude-mystery-9')
    // Nothing anywhere in the bubble may read as a price when none is known.
    expect(tip.textContent).not.toContain('$')
  })

  it('flags a total that could only be partly priced', async () => {
    invoke.mockResolvedValue(summary({ costUsd: 3.41, unpricedModels: ['claude-mystery-9'] }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('$3.41+'))
    expect(tip.textContent).toContain('claude-mystery-9')
  })

  it('reports a session that has not recorded usage yet', async () => {
    invoke.mockResolvedValue(null)
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('No usage recorded yet'))
  })

  it('rounds a sub-cent session up to a readable floor', async () => {
    invoke.mockResolvedValue(summary({ costUsd: 0.0004 }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('<$0.01'))
  })

  it('stays quiet when the read fails instead of breaking the tab', async () => {
    invoke.mockRejectedValue(new Error('nope'))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('Usage unavailable'))
  })
})
