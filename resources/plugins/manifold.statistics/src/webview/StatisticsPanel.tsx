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
  const { groups, error, loaded, refreshing, refresh, openExternal, reset } = useStatisticsBridge()
  // Clicking a per-repo card scopes the sections below it to that repo (null = all repos).
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const toggleSelected = (projectId: string): void => setSelectedProjectId((cur) => (cur === projectId ? null : projectId))
  const selectedName = selectedProjectId ? groups.find((g) => g.projectId === selectedProjectId)?.projectName ?? null : null
  const handleReset = (): void => { if (selectedProjectId) { reset(selectedProjectId); setSelectedProjectId(null) } }

  return (
    <div style={s.wrapper}>
      <div style={s.header}>
        <span style={s.title}>Statistics</span>
        <div style={s.headerActions}>
          {selectedName && (
            <button
              type="button"
              style={s.resetButton}
              onClick={handleReset}
              title={`Delete all captured sessions for ${selectedName}`}
            >
              Reset {selectedName}
            </button>
          )}
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
        {renderBody(loaded, groups, error, openExternal, selectedProjectId, toggleSelected)}
      </div>
    </div>
  )
}

function renderBody(
  loaded: boolean,
  groups: ProjectVerdicts[],
  error: string | null,
  openExternal: (url: string) => void,
  selectedProjectId: string | null,
  onSelectProject: (projectId: string) => void,
): React.JSX.Element | null {
  if (!loaded) return null
  const records = groups.flatMap((g) => g.records)
  if (records.length === 0 && !error) {
    return renderEmpty("No sessions captured yet — they'll show up here when you spawn agents.")
  }
  if (records.length === 0) return null

  const projectStats = computeProjectStats(groups)
  // The KPI hero and every list below the per-repo grid reflect the current scope:
  // the selected repo, or all repos when nothing is selected.
  const selected = selectedProjectId ? groups.find((g) => g.projectId === selectedProjectId) ?? null : null
  const scoped = selected ? selected.records : records
  const scopeName = selected?.projectName ?? null

  const stats = computeRuntimeStats(scoped)
  const totals = scoped.length
  const totalMerged = stats.reduce((sum, r) => sum + r.merged, 0)
  const totalDiscarded = stats.reduce((sum, r) => sum + r.discarded, 0)
  const mergedPct = totals === 0 ? 0 : Math.round((totalMerged / totals) * 100)
  const discardedPct = totals === 0 ? 0 : Math.round((totalDiscarded / totals) * 100)
  const avgEdits = totalMerged === 0 ? 0 : stats.reduce((sum, r) => sum + r.avgHumanEditsForMerged * r.merged, 0) / totalMerged

  return (
    <>
      {renderProjectBreakdown(projectStats, selectedProjectId, onSelectProject)}
      {renderKpiRow(totals, projectStats.length, scopeName, mergedPct, discardedPct, avgEdits)}
      {renderRuntimeGrid(stats, scopeName)}
      <RecentSessions recent={sortRecentFirst(scoped)} openExternal={openExternal} scopeName={scopeName} />
      {renderOutcomeFooter(computeOutcomeCounts(scoped))}
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

function renderKpiRow(totals: number, repos: number, scopeName: string | null, mergedPct: number, discardedPct: number, avgEdits: number): React.JSX.Element {
  // Subtitles name the active scope: the selected repo, or all repos when none is selected.
  const repoSub = scopeName ?? 'all repos'
  const sessionsSub = scopeName ?? `${repos} repo${repos === 1 ? '' : 's'}`
  return (
    <div style={s.kpiRow}>
      <Kpi label="Sessions" value={String(totals)} sub={sessionsSub} />
      <Kpi label="Merge rate" value={`${mergedPct}%`} sub={repoSub} tone="good" />
      <Kpi label="Discard rate" value={`${discardedPct}%`} sub={repoSub} tone="warn" />
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

function renderProjectBreakdown(
  stats: ProjectStat[],
  selectedProjectId: string | null,
  onSelectProject: (projectId: string) => void,
): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>Per-repo{selectedProjectId ? ' · click again to clear filter' : ' · click to filter'}</div>
      <div style={{ ...s.runtimeGrid, marginTop: 'var(--space-xs)' }}>
        {stats.map((stat) => {
          const isSelected = stat.projectId === selectedProjectId
          return (
            <button
              key={stat.projectId}
              type="button"
              onClick={() => onSelectProject(stat.projectId)}
              aria-pressed={isSelected}
              style={{ ...s.runtimeCard, ...s.repoCardButton, ...(isSelected ? s.repoCardSelected : null) }}
            >
              <div style={s.runtimeHeader}>
                <span style={s.runtimeName}>{stat.projectName}</span>
                <span style={s.runtimeTotal}>{stat.total} session{stat.total === 1 ? '' : 's'}</span>
              </div>
              <div style={s.runtimePrimaryMetric}>
                <span style={s.runtimePrimaryValue}>{stat.mergedPct}%</span>
                <span style={s.runtimePrimaryLabel}>merged</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function renderRuntimeGrid(stats: RuntimeStats[], scopeName: string | null): React.JSX.Element {
  return (
    <section>
      <div style={s.sectionLabel}>Per-runtime quality{scopeName ? ` · ${scopeName}` : ''}</div>
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
