import React from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useVerdicts } from '../../hooks/useVerdicts'
import { computeOutcomeCounts, computeRuntimeStats, sortRecentFirst } from './verdict-aggregates'
import { styles } from './VerdictsPanel.styles'
import type { TaskPrompt } from '../../../shared/verdict-types'

const RECENT_LIMIT = 50
const PROMPT_PREVIEW_CHARS = 80

export function VerdictsPanel(): React.JSX.Element {
  const dockState = useDockState()
  const projectId = dockState.activeProjectId
  const { records, loading, error, refresh } = useVerdicts(projectId)

  if (!projectId) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No sessions captured yet — they'll show up here when you spawn agents.</div>
      </div>
    )
  }

  const runtimeStats = computeRuntimeStats(records)
  const outcomeCounts = computeOutcomeCounts(records)
  const recent = sortRecentFirst(records).slice(0, RECENT_LIMIT)
  const isEmpty = !loading && records.length === 0 && !error

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Verdicts</span>
        <button type="button" style={styles.refreshButton} onClick={() => { void refresh() }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>Failed to load verdicts: {error}</div>}

      {isEmpty ? (
        <div style={styles.emptyState}>No sessions captured yet — they'll show up here when you spawn agents.</div>
      ) : records.length > 0 ? (
        <>
          <section>
            <div style={styles.sectionTitle}>Per-runtime quality</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Runtime</th>
                  <th style={styles.th}>Total</th>
                  <th style={styles.th}>Merged %</th>
                  <th style={styles.th}>Discarded %</th>
                  <th style={styles.th}>Avg edits before merge</th>
                </tr>
              </thead>
              <tbody>
                {runtimeStats.map((stat) => (
                  <tr key={stat.runtime}>
                    <td style={styles.td}>{stat.runtime}</td>
                    <td style={styles.td}>{stat.total}</td>
                    <td style={styles.td}>{stat.mergedPct}%</td>
                    <td style={styles.td}>{stat.discardedPct}%</td>
                    <td style={styles.td}>{stat.avgHumanEditsForMerged.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div style={styles.sectionTitle}>Recent sessions</div>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>When</th>
                  <th style={styles.th}>Runtime</th>
                  <th style={styles.th}>Outcome</th>
                  <th style={styles.th}>Prompt</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((rec) => (
                  <tr key={rec.sessionId}>
                    <td style={styles.td}>{formatTime(rec.createdAt)}</td>
                    <td style={styles.td}>{rec.runtime}</td>
                    <td style={styles.td}>{rec.outcome}</td>
                    <td style={{ ...styles.td, ...styles.promptCell }}>{renderPromptPreview(rec.taskPrompt)}</td>
                    <td style={styles.td}>
                      {rec.metrics.prUrl ? (
                        <a href={rec.metrics.prUrl} target="_blank" rel="noreferrer" style={styles.prLink}>PR</a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div style={styles.outcomeFooter}>
            {outcomeCounts.merged} merged · {outcomeCounts.pr_created} PR · {outcomeCounts.committed_only} committed · {outcomeCounts.discarded} discarded · {outcomeCounts.unknown} unknown
          </div>
        </>
      ) : null}
    </div>
  )
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString()
}

function renderPromptPreview(prompt: TaskPrompt): string {
  const text = prompt.kind === 'full' ? prompt.text : prompt.head
  if (text.length <= PROMPT_PREVIEW_CHARS) return text
  return text.slice(0, PROMPT_PREVIEW_CHARS) + '…'
}
