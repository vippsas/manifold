import React from 'react'
import type { ProjectVerdicts, VerdictOutcome, VerifyPullRequestsResult } from 'manifold'
import { useStatisticsBridge } from './use-statistics-bridge'
import {
  computeOutcomeCounts, computeRuntimeStats, computeProjectStats, sortRecentFirst, countSessionsWithPr,
  type RuntimeStats, type OutcomeCounts, type ProjectStat,
} from './aggregates'
import { RecentSessions } from './recent-sessions'
import { compactCount } from './format'
import { statisticsPanelStyles as s, outcomeColors, outcomeLabels } from './styles'

const OUTCOME_ORDER: VerdictOutcome[] = ['merged', 'pr_created', 'committed_only', 'discarded', 'unknown']

function formatTokens(stat: RuntimeStats): string {
  if (stat.inputTokens === 0 && stat.outputTokens === 0 && stat.turns === 0) return 'tokens —'
  return `${compactCount(stat.inputTokens)} in · ${compactCount(stat.outputTokens)} out · ${stat.turns} turn${stat.turns === 1 ? '' : 's'}`
}

export function StatisticsPanel(): React.JSX.Element {
  const { groups, error, loaded, refreshing, verifying, verifyResult, refresh, openExternal, reset, verifyPullRequests } = useStatisticsBridge()
  // Clicking a per-repo card scopes the sections below it to that repo (null = all repos).
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const toggleSelected = (projectId: string): void => setSelectedProjectId((cur) => (cur === projectId ? null : projectId))
  const selectedName = selectedProjectId ? groups.find((g) => g.projectId === selectedProjectId)?.projectName ?? null : null
  const handleReset = (): void => { if (selectedProjectId) { reset(selectedProjectId); setSelectedProjectId(null) } }
  const openPrCount = countVerifiablePrs(groups)

  return (
    <div style={s.wrapper}>
      <div style={{ ...s.header, justifyContent: 'flex-end', background: 'transparent', borderBottom: 'none' }}>
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
            style={verifying ? { ...s.refreshButton, ...s.refreshButtonBusy } : s.refreshButton}
            onClick={() => verifyPullRequests()}
            disabled={!loaded || verifying || openPrCount === 0}
            title={openPrCount === 0 ? 'No captured open PRs to verify' : `Verify ${openPrCount} captured open PR${openPrCount === 1 ? '' : 's'}`}
          >
            {verifying ? 'Verifying…' : 'Verify PRs'}
          </button>
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
        {renderBody(loaded, groups, error, openExternal, selectedProjectId, toggleSelected, verifying, verifyResult)}
      </div>
    </div>
  )
}

function countVerifiablePrs(groups: ProjectVerdicts[]): number {
  return groups.flatMap((g) => g.records).filter((r) => r.outcome === 'pr_created' && Boolean(r.metrics.prUrl)).length
}

function renderBody(
  loaded: boolean,
  groups: ProjectVerdicts[],
  error: string | null,
  openExternal: (url: string) => void,
  selectedProjectId: string | null,
  onSelectProject: (projectId: string) => void,
  verifying: boolean,
  verifyResult: VerifyPullRequestsResult | null,
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
      {renderOutcomeFooter(computeOutcomeCounts(scoped), countSessionsWithPr(scoped), verifying, verifyResult)}
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
            <div style={s.runtimeFootnote}>{formatTokens(stat)}</div>
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

function renderOutcomeFooter(counts: OutcomeCounts, prsCreated: number, verifying: boolean, verifyResult: VerifyPullRequestsResult | null): React.JSX.Element {
  return (
    <div style={s.outcomeFooterWrap}>
      <div style={s.outcomeFooter}>
        {OUTCOME_ORDER.map((outcome) => (
          <div key={outcome} style={s.outcomeFooterItem}>
            <span style={{ ...s.outcomeFooterDot, background: outcomeColors[outcome] ?? 'var(--text-muted)' }} />
            <span>{counts[outcome]} {outcomeLabels[outcome]}</span>
          </div>
        ))}
      </div>
      <div style={s.outcomeFooterNote}>
        Sessions with a PR: {prsCreated} <span style={s.outcomeFooterNoteHint}>· cached PR state, max one PR per session</span>
      </div>
      {verifyResult && (
        <div style={s.outcomeFooterNote}>
          PR verification: {verifyResult.checked}/{verifyResult.eligible} checked · {verifyResult.updated} updated · {verifyResult.failed} failed
        </div>
      )}
      {verifying && counts.pr_created > 0 && (
        <div style={s.outcomeFooterNote}>
          <span style={s.outcomeFooterNoteHint}>Refreshing cached open PR state…</span>
        </div>
      )}
      {!verifying && !verifyResult && counts.pr_created > 0 && (
        <div style={s.outcomeFooterNote}>
          <span style={s.outcomeFooterNoteHint}>Use Verify PRs to refresh cached open PR state.</span>
        </div>
      )}
    </div>
  )
}
