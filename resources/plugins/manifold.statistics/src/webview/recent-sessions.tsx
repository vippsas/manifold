import React from 'react'
import type { TaskPrompt, VerdictMetrics, VerdictRecord, VerdictOutcome } from 'manifold'
import { compactCount } from './format'
import { statisticsPanelStyles as s, outcomeColors, outcomeLabels, outcomeChipStyle } from './styles'

const PROMPT_PREVIEW_CHARS = 96
const RUNTIME_LABELS: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', __shell__: 'Shell' }

/** The "Recent sessions" list — one row per captured session (all repos, or the selected one). */
export function RecentSessions({ recent, openExternal, scopeName }: { recent: VerdictRecord[]; openExternal: (url: string) => void; scopeName?: string | null }): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>{`Recent sessions · ${recent.length}${scopeName ? ` · ${scopeName}` : ''}`}</div>
      <div style={{ ...s.recentList, marginTop: 'var(--space-xs)' }}>
        {recent.map((rec) => {
          const accentColor = outcomeColors[rec.outcome] ?? outcomeColors.unknown
          const title = sessionTitle(rec)
          return (
            <div key={rec.sessionId} style={s.recentRow}>
              <div style={{ ...s.recentAccent, background: accentColor }} />
              <div style={s.recentMain}>
                <div style={s.recentTopLine}>
                  <span style={s.recentRuntime}>{title}</span>
                  <span style={s.recentTime}>{formatTime(rec.createdAt)}</span>
                </div>
                <div style={s.recentPrompt}>{formatBranch(rec.branch)} · {runtimeLabel(rec.runtime)}</div>
                <MetricStrip metrics={rec.metrics} />
              </div>
              <div style={s.recentRight}>
                <OutcomeBadge outcome={rec.outcome} metrics={rec.metrics} onOpen={openExternal} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function sessionTitle(record: VerdictRecord): string {
  return record.title?.trim() || renderPromptPreview(record.taskPrompt)
}

function runtimeLabel(runtime: string): string {
  return RUNTIME_LABELS[runtime] ?? humanize(runtime)
}

function formatBranch(branch: string): string {
  return humanize(branch.replace(/^manifold\//, '').split('/').pop() || branch)
}

function humanize(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

// One badge per row. When the session has a PR, the status badge IS the link —
// clicking it opens the PR (the sandboxed webview asks the host to navigate).
// No PR → a plain, non-interactive status chip.
function OutcomeBadge({ outcome, metrics, onOpen }: { outcome: VerdictOutcome; metrics: VerdictMetrics; onOpen: (url: string) => void }): React.JSX.Element {
  const prUrl = metrics.prUrl
  const label = outcome === 'pr_created' && metrics.prState === 'closed' ? 'closed PR' : outcomeLabels[outcome] ?? outcome
  if (!prUrl) {
    return <span style={{ ...s.outcomeChip, ...outcomeChipStyle(outcome) }}>{label}</span>
  }
  const marker = prMarker(outcome, metrics)
  return (
    <button
      type="button"
      style={{ ...s.outcomeChip, ...outcomeChipStyle(outcome), ...s.outcomeChipLink }}
      onClick={() => onOpen(prUrl)}
      title={prTitle(prUrl, outcome, metrics)}
    >
      {label}
      {marker && <span aria-hidden="true" style={s.outcomeChipArrow}>{marker}</span>}
      <span aria-hidden="true" style={s.outcomeChipArrow}>↗</span>
    </button>
  )
}

function prMarker(outcome: VerdictOutcome, metrics: VerdictMetrics): string | null {
  if (!metrics.prUrl || outcome !== 'pr_created') return null
  if (metrics.prCheckError) return '!'
  return metrics.prCheckedAt ? null : '?'
}

function prTitle(prUrl: string, outcome: VerdictOutcome, metrics: VerdictMetrics): string {
  if (outcome !== 'pr_created') return `Open ${prUrl}`
  if (metrics.prCheckError) return `Open ${prUrl} (PR verification failed ${formatTime(metrics.prCheckedAt ?? '')}: ${metrics.prCheckError})`
  if (!metrics.prCheckedAt) return `Open ${prUrl} (PR state is cached and not verified)`
  return `Open ${prUrl} (verified ${formatTime(metrics.prCheckedAt)} as ${metrics.prState ?? 'unknown'})`
}

function MetricStrip({ metrics }: { metrics: VerdictMetrics }): React.JSX.Element {
  const { agentCommits, humanEdits, filesChanged, diffLines, tokenUsage, turns } = metrics
  const hasDiff = diffLines.added > 0 || diffLines.removed > 0
  const hasTokens = (tokenUsage && (tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0)) || (turns ?? 0) > 0
  const hasAnything = agentCommits > 0 || humanEdits > 0 || filesChanged > 0 || hasDiff || hasTokens

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
      {tokenUsage && tokenUsage.inputTokens > 0 && <Chip label="in" value={compactCount(tokenUsage.inputTokens)} ariaLabel={`${tokenUsage.inputTokens} input tokens`} />}
      {tokenUsage && tokenUsage.outputTokens > 0 && <Chip label="out" value={compactCount(tokenUsage.outputTokens)} ariaLabel={`${tokenUsage.outputTokens} output tokens`} />}
      {(turns ?? 0) > 0 && <Chip label={turns === 1 ? 'turn' : 'turns'} value={String(turns)} ariaLabel={`${turns} turns`} />}
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
