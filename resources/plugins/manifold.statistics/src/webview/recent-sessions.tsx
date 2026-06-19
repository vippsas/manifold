import React from 'react'
import type { TaskPrompt, VerdictMetrics, VerdictRecord, VerdictOutcome } from 'manifold'
import { statisticsPanelStyles as s, outcomeColors, outcomeLabels, outcomeChipStyle } from './styles'

const PROMPT_PREVIEW_CHARS = 96

/** The "Recent sessions" list — one row per captured session across all repos. */
export function RecentSessions({ recent, openExternal }: { recent: VerdictRecord[]; openExternal: (url: string) => void }): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>{`Recent sessions · ${recent.length}`}</div>
      <div style={{ ...s.recentList, marginTop: 'var(--space-xs)' }}>
        {recent.map((rec) => {
          const accentColor = outcomeColors[rec.outcome] ?? outcomeColors.unknown
          return (
            <div key={rec.sessionId} style={s.recentRow}>
              <div style={{ ...s.recentAccent, background: accentColor }} />
              <div style={s.recentMain}>
                <div style={s.recentTopLine}>
                  <span style={s.recentRuntime}>{rec.runtime}</span>
                  <span style={s.recentTime}>{formatTime(rec.createdAt)}</span>
                </div>
                <div style={s.recentPrompt}>{renderPromptPreview(rec.taskPrompt)}</div>
                <MetricStrip metrics={rec.metrics} />
              </div>
              <div style={s.recentRight}>
                <OutcomeBadge outcome={rec.outcome} prUrl={rec.metrics.prUrl} onOpen={openExternal} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// One badge per row. When the session has a PR, the status badge IS the link —
// clicking it opens the PR (the sandboxed webview asks the host to navigate).
// No PR → a plain, non-interactive status chip.
function OutcomeBadge({ outcome, prUrl, onOpen }: { outcome: VerdictOutcome; prUrl?: string; onOpen: (url: string) => void }): React.JSX.Element {
  const label = outcomeLabels[outcome] ?? outcome
  if (!prUrl) {
    return <span style={{ ...s.outcomeChip, ...outcomeChipStyle(outcome) }}>{label}</span>
  }
  return (
    <button
      type="button"
      style={{ ...s.outcomeChip, ...outcomeChipStyle(outcome), ...s.outcomeChipLink }}
      onClick={() => onOpen(prUrl)}
      title={`Open ${prUrl}`}
    >
      {label}
      <span aria-hidden="true" style={s.outcomeChipArrow}>↗</span>
    </button>
  )
}

function MetricStrip({ metrics }: { metrics: VerdictMetrics }): React.JSX.Element {
  const { agentCommits, humanEdits, filesChanged, diffLines } = metrics
  const hasDiff = diffLines.added > 0 || diffLines.removed > 0
  const hasAnything = agentCommits > 0 || humanEdits > 0 || filesChanged > 0 || hasDiff

  if (!hasAnything) {
    return <div style={s.metricStripEmpty} aria-label="no activity captured">no activity</div>
  }

  return (
    <div style={s.metricStrip} aria-label="session metrics">
      {agentCommits > 0 && <Chip label="commits" value={String(agentCommits)} ariaLabel={`${agentCommits} agent commits`} />}
      {humanEdits > 0 && <Chip label="edits" value={String(humanEdits)} ariaLabel={`${humanEdits} human edits`} />}
      {filesChanged > 0 && <Chip label="files" value={String(filesChanged)} ariaLabel={`${filesChanged} files changed`} />}
      {hasDiff && (
        <span style={s.metricChip} aria-label={`${diffLines.added} lines added, ${diffLines.removed} lines removed`}>
          <span style={s.metricChipAdded}>+{diffLines.added}</span>
          <span style={s.metricChipRemoved}>−{diffLines.removed}</span>
        </span>
      )}
    </div>
  )
}

function Chip({ label, value, ariaLabel }: { label: string; value: string; ariaLabel?: string }): React.JSX.Element {
  return (
    <span style={s.metricChip} aria-label={ariaLabel}>
      <span style={s.metricChipValue}>{value}</span>
      <span style={s.metricChipLabel}>{label}</span>
    </span>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const now = Date.now()
  const diffSec = Math.round((now - date.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

function renderPromptPreview(prompt: TaskPrompt): string {
  const text = prompt.kind === 'full' ? prompt.text : prompt.head
  if (text.length <= PROMPT_PREVIEW_CHARS) return text
  return text.slice(0, PROMPT_PREVIEW_CHARS) + '…'
}
