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
    expect(tip.textContent).toContain('1.2M tokens')
    expect(tip.textContent).toContain('47 turns')
  })

  it('says how much of the total is cached context, not what you typed', async () => {
    // A one-word prompt still bills the whole system prompt + CLAUDE.md + tool
    // defs as cache traffic. Without this the total reads like a counting bug.
    invoke.mockResolvedValue(summary({
      tokenUsage: { inputTokens: 2, outputTokens: 170, cacheReadTokens: 14_299, cacheCreationTokens: 15_896 },
      turns: 1,
      costUsd: 0.17,
    }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('30.4k tokens (30.2k context)'))
    expect(tip.textContent).toContain('1 turn')
  })

  it('omits the context note when nothing was cached', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('1.2M tokens'))
    expect(tip.textContent).not.toContain('context')
  })

  it('marks the figure as an estimate at API rates rather than money spent', async () => {
    invoke.mockResolvedValue(summary())
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('API rates'))
  })

  it('says the cost is unavailable rather than inventing one for an unknown model', async () => {
    invoke.mockResolvedValue(summary({ costUsd: null, unpricedModels: ['claude-mystery-9'] }))
    render(<AgentTabUsage sessionId="s1" />)

    fireEvent.pointerEnter(icon())

    const tip = await bubble()
    await waitFor(() => expect(tip.textContent).toContain('Cost unavailable'))
    expect(tip.textContent).toContain('claude-mystery-9')
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
