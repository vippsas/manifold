import React from 'react'
import { Tooltip } from './common/Tooltip'
import type { SessionCostSummary } from '../../shared/types'

type Usage =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; summary: SessionCostSummary }
  | { kind: 'empty' }
  | { kind: 'failed' }

function CostIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1">
      <circle cx="6" cy="6" r="4.6" />
      <path d="M7.4 4.6a1.6 1.6 0 0 0-1.4-.7c-.8 0-1.3.4-1.3.9s.5.8 1.3 1c.9.2 1.4.5 1.4 1s-.6 1-1.4 1a1.6 1.6 0 0 1-1.4-.7" strokeLinecap="round" />
      <path d="M6 3.2v5.6" strokeLinecap="round" />
    </svg>
  )
}

/** 1_200_000 → "1.2M". Exact counts past a thousand are noise in a tooltip. */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

/** Anything under a cent reads as a floor, not a rounded-to-zero "$0.00". */
function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return '<$0.01'
  return `~$${n.toFixed(2)}`
}

function describeSummary(s: SessionCostSummary): { label: string; detail: string } {
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = s.tokenUsage
  const total = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
  const facts = `${formatTokens(total)} tokens · ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'}`
  const missing = s.unpricedModels.join(', ')

  if (s.costUsd === null) {
    return { label: 'Cost unavailable', detail: `${facts} · no published price for ${missing}` }
  }
  const partial = s.unpricedModels.length > 0
  return {
    label: `${formatUsd(s.costUsd)}${partial ? '+' : ''}`,
    detail: partial
      ? `${facts} · est. at API rates, excludes ${missing}`
      : `${facts} · est. at API rates`,
  }
}

function describe(usage: Usage): { label: string; detail?: string } {
  switch (usage.kind) {
    case 'idle':
    case 'loading':
      return { label: 'Session cost', detail: 'Reading usage…' }
    case 'empty':
      return { label: 'No usage recorded yet', detail: 'This agent has not finished a turn.' }
    case 'failed':
      return { label: 'Usage unavailable', detail: 'Could not read this session’s transcript.' }
    case 'ready':
      return describeSummary(usage.summary)
  }
}

/**
 * The agent tab's cost affordance: a coin that answers "what has this session
 * cost?" on hover.
 *
 * Reads on hover rather than on a timer — an idle tab costs nothing, and the
 * number is current whenever it is actually on screen. The figure is an estimate
 * derived from published API rates (Claude records tokens, not prices), which
 * the tooltip says out loud so a subscription user does not read it as a bill.
 */
export function AgentTabUsage({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [usage, setUsage] = React.useState<Usage>({ kind: 'idle' })
  const inFlight = React.useRef(false)

  const load = React.useCallback((): void => {
    if (inFlight.current) return
    inFlight.current = true
    // Re-hovering refetches, but keeps the last figure on screen while it does —
    // flipping back to "Reading usage…" would strobe on every pass.
    setUsage((prev) => (prev.kind === 'idle' ? { kind: 'loading' } : prev))
    void window.electronAPI.invoke('agent:session-usage', sessionId)
      .then((result) => {
        setUsage(result ? { kind: 'ready', summary: result as SessionCostSummary } : { kind: 'empty' })
      })
      .catch(() => setUsage({ kind: 'failed' }))
      .finally(() => { inFlight.current = false })
  }, [sessionId])

  const { label, detail } = describe(usage)

  return (
    <Tooltip label={label} detail={detail}>
      <span
        className="dock-tab__action dock-tab__usage"
        role="note"
        tabIndex={0}
        aria-label="Session cost"
        onPointerEnter={load}
        onFocus={load}
      >
        <CostIcon />
      </span>
    </Tooltip>
  )
}
