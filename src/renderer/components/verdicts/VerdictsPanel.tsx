import React from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useVerdicts } from '../../hooks/useVerdicts'
import { computeOutcomeCounts, computeRuntimeStats, sortRecentFirst, type RuntimeStats, type OutcomeCounts } from './verdict-aggregates'
import {
  verdictsPanelStyles as s,
  outcomeColors,
  outcomeLabels,
  outcomeChipStyle,
} from './VerdictsPanel.styles'
import type { TaskPrompt, VerdictMetrics, VerdictRecord, VerdictOutcome } from '../../../shared/verdict-types'

const RECENT_LIMIT = 50
const PROMPT_PREVIEW_CHARS = 96
const OUTCOME_ORDER: VerdictOutcome[] = ['merged', 'pr_created', 'committed_only', 'discarded', 'unknown']

export function VerdictsPanel(): React.JSX.Element {
  const dockState = useDockState()
  const projectId = dockState.activeProjectId
  const { records, loading, error, refresh } = useVerdicts(projectId)

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <span style={s.title}>Verdicts</span>
        <button
          type="button"
          style={loading ? { ...s.refreshButton, ...s.refreshButtonBusy } : s.refreshButton}
          onClick={() => { void refresh() }}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div style={s.content}>
        {error && <div style={s.errorBox}>Failed to load verdicts: {error}</div>}
        {renderBody(projectId, records, loading, error)}
      </div>
    </div>
  )
}

function renderBody(
  projectId: string | null,
  records: VerdictRecord[],
  loading: boolean,
  error: string | null,
): React.JSX.Element | null {
  if (!projectId) return renderEmpty('Select a project to see its verdicts.')
  if (!loading && records.length === 0 && !error) {
    return renderEmpty("No sessions captured yet — they'll show up here when you spawn agents.")
  }
  if (records.length === 0) return null

  const runtimeStats = computeRuntimeStats(records)
  const outcomeCounts = computeOutcomeCounts(records)
  const recent = sortRecentFirst(records).slice(0, RECENT_LIMIT)
  const totals = records.length
  const totalMerged = runtimeStats.reduce((sum, r) => sum + r.merged, 0)
  const totalDiscarded = runtimeStats.reduce((sum, r) => sum + r.discarded, 0)
  const mergedPct = totals === 0 ? 0 : Math.round((totalMerged / totals) * 100)
  const discardedPct = totals === 0 ? 0 : Math.round((totalDiscarded / totals) * 100)
  const avgEdits = totalMerged === 0 ? 0 : runtimeStats.reduce((sum, r) => sum + r.avgHumanEditsForMerged * r.merged, 0) / totalMerged

  return (
    <>
      {renderKpiRow(totals, mergedPct, discardedPct, avgEdits)}
      {renderRuntimeGrid(runtimeStats, outcomeCounts)}
      {renderRecentSessions(recent)}
      {renderOutcomeFooter(outcomeCounts)}
    </>
  )
}

function renderEmpty(message: string): React.JSX.Element {
  return (
    <div style={s.empty}>
      <div style={s.emptyGlyph}>·</div>
      <div>{message}</div>
    </div>
  )
}

function renderKpiRow(totals: number, mergedPct: number, discardedPct: number, avgEdits: number): React.JSX.Element {
  return (
    <div style={s.kpiRow}>
      <Kpi label="Sessions" value={String(totals)} sub="captured" />
      <Kpi label="Merge rate" value={`${mergedPct}%`} sub="all runtimes" tone="good" />
      <Kpi label="Discard rate" value={`${discardedPct}%`} sub="all runtimes" tone="warn" />
      <Kpi label="Avg edits" value={avgEdits.toFixed(1)} sub="before merge" />
    </div>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' }): React.JSX.Element {
  const valueStyle: React.CSSProperties = {
    ...s.kpiValue,
    ...(tone === 'good' ? s.kpiValueGood : tone === 'warn' ? s.kpiValueWarn : null),
  }
  return (
    <div style={s.kpiCard}>
      <div style={s.kpiLabel}>{label}</div>
      <div style={valueStyle}>{value}</div>
      <div style={s.kpiSub}>{sub}</div>
    </div>
  )
}

function renderRuntimeGrid(stats: RuntimeStats[], _counts: OutcomeCounts): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>Per-runtime quality</div>
      <div style={{ ...s.runtimeGrid, marginTop: 'var(--space-xs)' }}>
        {stats.map((stat) => (
          <article key={stat.runtime} style={s.runtimeCard}>
            <div style={s.runtimeHeader}>
              <span style={s.runtimeName}>{stat.runtime}</span>
              <span style={s.runtimeTotal}>{stat.total} session{stat.total === 1 ? '' : 's'}</span>
            </div>
            <div style={s.runtimePrimaryMetric}>
              <span style={s.runtimePrimaryValue}>{stat.mergedPct}%</span>
              <span style={s.runtimePrimaryLabel}>merged</span>
            </div>
            <OutcomeBar stat={stat} />
            <div style={s.runtimeFootnote}>
              {stat.discarded} discarded · {stat.avgHumanEditsForMerged.toFixed(1)} avg edits
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function OutcomeBar({ stat }: { stat: RuntimeStats }): React.JSX.Element {
  // The aggregator currently exposes only merged/discarded counts; the
  // remainder is "other" (committed_only + pr_created + unknown). We render
  // three segments so the user can see at-a-glance proportions.
  const other = stat.total - stat.merged - stat.discarded
  const segments: Array<{ color: string; flex: number; key: string }> = [
    { key: 'merged', color: outcomeColors.merged, flex: stat.merged },
    { key: 'other', color: outcomeColors.committed_only, flex: other },
    { key: 'discarded', color: outcomeColors.discarded, flex: stat.discarded },
  ].filter((segment) => segment.flex > 0)
  return (
    <div style={s.outcomeBar} role="img" aria-label={`${stat.mergedPct}% merged`}>
      {segments.map((segment) => (
        <div key={segment.key} style={{ background: segment.color, flex: segment.flex }} />
      ))}
    </div>
  )
}

function renderRecentSessions(recent: VerdictRecord[]): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>Recent sessions</div>
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
                <span style={{ ...s.outcomeChip, ...outcomeChipStyle(rec.outcome) }}>
                  {outcomeLabels[rec.outcome] ?? rec.outcome}
                </span>
                {rec.metrics.prUrl ? (
                  <a href={rec.metrics.prUrl} target="_blank" rel="noreferrer" style={s.prLink}>PR</a>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
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
      {agentCommits > 0 && (
        <Chip label="commits" value={String(agentCommits)} ariaLabel={`${agentCommits} agent commits`} />
      )}
      {humanEdits > 0 && (
        <Chip label="edits" value={String(humanEdits)} ariaLabel={`${humanEdits} human edits`} />
      )}
      {filesChanged > 0 && (
        <Chip label="files" value={String(filesChanged)} ariaLabel={`${filesChanged} files changed`} />
      )}
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

function renderOutcomeFooter(counts: OutcomeCounts): React.JSX.Element {
  return (
    <div style={s.outcomeFooter}>
      {OUTCOME_ORDER.map((outcome) => (
        <div key={outcome} style={s.outcomeFooterItem}>
          <span style={{ ...s.outcomeFooterDot, background: outcomeColors[outcome] ?? 'var(--text-muted)' }} />
          <span>{counts[outcome]} {outcomeLabels[outcome]}</span>
        </div>
      ))}
    </div>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
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
