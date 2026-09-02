import React from 'react'
import { Tooltip } from './common/Tooltip'
import { agentTabUsageStyles as styles } from './AgentTabUsage.styles'
import type { SessionCostRow, SessionCostSummary } from '../../shared/types'

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

/** Row prices drop the tilde — the headline already says the whole thing is an estimate. */
function rowUsd(n: number | null): string {
  if (n === null) return '—'
  if (n > 0 && n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

/**
 * Where each model's tokens went. This is the answer to "why is the total so
 * big?": cache traffic dwarfs anything typed, and a model switch re-writes the
 * whole prefix under the new model because caches are model-scoped.
 */
function Breakdown({ rows }: { rows: SessionCostRow[] }): React.JSX.Element {
  return (
    <div style={styles.table}>
      <span style={styles.headModel}>Model</span>
      <span style={styles.head}>In</span>
      <span style={styles.head}>Out</span>
      <span style={styles.head}>Cache r</span>
      <span style={styles.head}>Cache w</span>
      <span style={styles.head}>Cost</span>
      {rows.map((r) => (
        <React.Fragment key={r.model}>
          <span style={styles.model}>{r.model}</span>
          <span style={styles.num}>{formatTokens(r.inputTokens)}</span>
          <span style={styles.num}>{formatTokens(r.outputTokens)}</span>
          <span style={styles.num}>{formatTokens(r.cacheReadTokens)}</span>
          <span style={styles.num}>{formatTokens(r.cacheWriteTokens)}</span>
          <span style={styles.cost}>{rowUsd(r.costUsd)}</span>
        </React.Fragment>
      ))}
      {/* With one model the row already is the total; a second identical line
          would be noise. */}
      {rows.length > 1 && <Totals rows={rows} />}
    </div>
  )
}

/**
 * Column sums, computed from the exact figures.
 *
 * Each cell above is rounded to fit the width, so adding the visible numbers
 * does not reconcile — 22,823 and 16,738 read as `22.8k` and `16.7k`, whose sum
 * is 39.5k against a true 39.6k. This row does the addition properly.
 */
function Totals({ rows }: { rows: SessionCostRow[] }): React.JSX.Element {
  const sum = (pick: (r: SessionCostRow) => number): number => rows.reduce((n, r) => n + pick(r), 0)
  const priced = rows.filter((r) => r.costUsd !== null)
  const cost = priced.length > 0 ? priced.reduce((n, r) => n + (r.costUsd ?? 0), 0) : null

  return (
    <>
      <span style={styles.totalLabel}>Total</span>
      <span style={styles.totalNum}>{formatTokens(sum((r) => r.inputTokens))}</span>
      <span style={styles.totalNum}>{formatTokens(sum((r) => r.outputTokens))}</span>
      <span style={styles.totalNum}>{formatTokens(sum((r) => r.cacheReadTokens))}</span>
      <span style={styles.totalNum}>{formatTokens(sum((r) => r.cacheWriteTokens))}</span>
      <span style={styles.totalCost}>{rowUsd(cost)}</span>
    </>
  )
}

function describeSummary(s: SessionCostSummary): { label: string; body: React.ReactNode } {
  const { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens } = s.tokenUsage
  const total = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens
  const partial = s.unpricedModels.length > 0
  const label = s.costUsd === null
    ? 'Cost unavailable'
    : `${formatUsd(s.costUsd)}${partial ? '+' : ''}`

  return {
    label,
    body: (
      <div style={styles.body}>
        <span style={styles.summary}>
          {/* Two different quantities, and conflating them is what made the total
              look wrong: `billed` is cumulative across every request (each turn
              re-reads the cached prefix and pays again), `context` is what the
              newest request carried and matches the status line's `Ctx`. */}
          {`${formatTokens(total)} billed · ${formatTokens(s.contextTokens)} context · ${s.turns} ${s.turns === 1 ? 'turn' : 'turns'} · est. at API rates`}
        </span>
        <Breakdown rows={s.byModel} />
        {partial && (
          <span style={styles.note}>{`No published price for ${s.unpricedModels.join(', ')}.`}</span>
        )}
      </div>
    ),
  }
}

function describe(usage: Usage): { label: string; detail?: string; body?: React.ReactNode } {
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
 * The coin is visible at rest, like the tab's other controls — you should not
 * have to already suspect a cost to discover there is one. Only the figure waits
 * for a hover.
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

  const { label, detail, body } = describe(usage)

  return (
    <Tooltip label={label} detail={detail} body={body}>
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
