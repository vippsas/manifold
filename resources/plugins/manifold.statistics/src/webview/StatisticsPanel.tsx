import React from 'react'
import type { ProjectVerdicts, VerdictOutcome } from 'manifold'
import { useStatisticsBridge } from './use-statistics-bridge'
import {
  computeOutcomeCounts, computeRuntimeStats, computeProjectStats, sortRecentFirst,
  type RuntimeStats, type OutcomeCounts, type ProjectStat,
} from './aggregates'
import { RecentSessions } from './recent-sessions'
import { statisticsPanelStyles as s, outcomeColors, outcomeLabels } from './styles'

const OUTCOME_ORDER: VerdictOutcome[] = ['merged', 'pr_created', 'committed_only', 'discarded', 'unknown']

export function StatisticsPanel(): React.JSX.Element {
  const { groups, error, loaded, refreshing, refresh, openExternal } = useStatisticsBridge()

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <span style={s.title}>Statistics</span>
        <div style={s.headerActions}>
          <button
            type="button"
            style={refreshing ? { ...s.refreshButton, ...s.refreshButtonBusy } : s.refreshButton}
            onClick={() => refresh()}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={s.content}>
        {error && <div style={s.errorBox}>Failed to load statistics: {error}</div>}
        {renderBody(loaded, groups, error, openExternal)}
      </div>
    </div>
  )
}

function renderBody(
  loaded: boolean,
  groups: ProjectVerdicts[],
  error: string | null,
  openExternal: (url: string) => void,
): React.JSX.Element | null {
  if (!loaded) return null
  const records = groups.flatMap((g) => g.records)
  if (records.length === 0 && !error) {
    return renderEmpty("No sessions captured yet — they'll show up here when you spawn agents.")
  }
  if (records.length === 0) return null

  const runtimeStats = computeRuntimeStats(records)
  const projectStats = computeProjectStats(groups)
  const outcomeCounts = computeOutcomeCounts(records)
  const recent = sortRecentFirst(records)
  const totals = records.length
  const totalMerged = runtimeStats.reduce((sum, r) => sum + r.merged, 0)
  const totalDiscarded = runtimeStats.reduce((sum, r) => sum + r.discarded, 0)
  const mergedPct = totals === 0 ? 0 : Math.round((totalMerged / totals) * 100)
  const discardedPct = totals === 0 ? 0 : Math.round((totalDiscarded / totals) * 100)
  const avgEdits = totalMerged === 0 ? 0 : runtimeStats.reduce((sum, r) => sum + r.avgHumanEditsForMerged * r.merged, 0) / totalMerged

  return (
    <>
      {renderKpiRow(totals, projectStats.length, mergedPct, discardedPct, avgEdits)}
      {renderProjectBreakdown(projectStats)}
      {renderRuntimeGrid(runtimeStats)}
      <RecentSessions recent={recent} openExternal={openExternal} />
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

function renderKpiRow(totals: number, repos: number, mergedPct: number, discardedPct: number, avgEdits: number): React.JSX.Element {
  return (
    <div style={s.kpiRow}>
      <Kpi label="Sessions" value={String(totals)} sub={`${repos} repo${repos === 1 ? '' : 's'}`} />
      <Kpi label="Merge rate" value={`${mergedPct}%`} sub="all repos" tone="good" />
      <Kpi label="Discard rate" value={`${discardedPct}%`} sub="all repos" tone="warn" />
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

function renderProjectBreakdown(stats: ProjectStat[]): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>Per-repo</div>
      <div style={{ ...s.runtimeGrid, marginTop: 'var(--space-xs)' }}>
        {stats.map((stat) => (
          <article key={stat.projectId} style={s.runtimeCard}>
            <div style={s.runtimeHeader}>
              <span style={s.runtimeName}>{stat.projectName}</span>
              <span style={s.runtimeTotal}>{stat.total} session{stat.total === 1 ? '' : 's'}</span>
            </div>
            <div style={s.runtimePrimaryMetric}>
              <span style={s.runtimePrimaryValue}>{stat.mergedPct}%</span>
              <span style={s.runtimePrimaryLabel}>merged</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function renderRuntimeGrid(stats: RuntimeStats[]): React.JSX.Element {
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
  // merged / other (committed_only + pr_created + unknown) / discarded.
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
