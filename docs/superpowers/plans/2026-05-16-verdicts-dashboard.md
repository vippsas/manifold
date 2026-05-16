# Verdicts Dashboard Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Verdicts dashboard tab to Manifold's dock layout, hidden by default and enabled via the Settings dialog, that shows per-runtime quality aggregates and recent sessions for the active project.

**Architecture:** Pure renderer-side feature. Reuses the existing `verdicts:list` IPC. Mirrors the `showLoopTab` plumbing across `ManifoldSettings`, `useDockLayout`, the dock builder, and Settings UI. Aggregation logic lives in a pure module so it's testable without React.

**Tech Stack:** TypeScript, React, dockview, Vitest. No new dependencies.

---

## File Structure

**Create:**
- `src/renderer/components/verdicts/VerdictsPanel.tsx` — top-level panel component
- `src/renderer/components/verdicts/VerdictsPanel.styles.ts` — plain-object styles
- `src/renderer/components/verdicts/VerdictsPanel.test.tsx`
- `src/renderer/components/verdicts/verdict-aggregates.ts` — pure aggregation functions
- `src/renderer/components/verdicts/verdict-aggregates.test.ts`
- `src/renderer/hooks/useVerdicts.ts` — `{ records, loading, error, refresh }`
- `src/renderer/hooks/useVerdicts.test.ts`

**Modify:**
- `src/shared/types.ts` — add `showVerdictsTab: boolean` to `ManifoldSettings`
- `src/shared/defaults.ts` — `showVerdictsTab: false`
- `src/renderer/hooks/dock-layout-helpers.ts` — extend `PANEL_IDS`, `PANEL_TITLES`, `PANEL_RESTORE_HINTS`
- `src/renderer/hooks/dock-layout-builders.ts` — gated registration
- `src/renderer/hooks/dock-layout-builders.test.ts` — coverage for new branch (if it exists; otherwise create)
- `src/renderer/hooks/useDockLayout.ts` — new parameter + `applyVerdictsTabSetting`
- `src/renderer/components/editor/dock-panels.tsx` — register `verdicts` component
- `src/renderer/App.tsx` — pass `settings.showVerdictsTab` to `useDockLayout`
- `src/renderer/components/modals/SettingsModal.tsx` — state + plumbing
- `src/renderer/components/modals/settings/SettingsModalBody.tsx` — thread props through
- `src/renderer/components/modals/settings/GeneralSettingsSection.tsx` — checkbox + props

---

## Task 1: Add `showVerdictsTab` to settings schema and defaults

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/defaults.ts`

- [ ] **Step 1: Extend `ManifoldSettings`**

In `src/shared/types.ts`, find the `ManifoldSettings` interface (the one currently containing `showIdeasTab` and `showLoopTab` — around line 75–95) and add:

```ts
  showVerdictsTab: boolean
```

Place it directly after `showLoopTab` to keep the visual grouping.

- [ ] **Step 2: Extend `DEFAULT_SETTINGS`**

In `src/shared/defaults.ts`, find the `DEFAULT_SETTINGS` object literal that contains `showLoopTab: false` and add:

```ts
  showVerdictsTab: false,
```

Place it directly after `showLoopTab`.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: PASS. Pre-existing errors should not increase. (Baseline before this work: 20 node, 23 web.)

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/defaults.ts
git commit -m "Add showVerdictsTab to ManifoldSettings (default false)"
```

---

## Task 2: Implement pure aggregator with tests

**Files:**
- Create: `src/renderer/components/verdicts/verdict-aggregates.ts`
- Create: `src/renderer/components/verdicts/verdict-aggregates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/components/verdicts/verdict-aggregates.test.ts
import { describe, it, expect } from 'vitest'
import {
  computeRuntimeStats,
  computeOutcomeCounts,
  sortRecentFirst,
} from './verdict-aggregates'
import type { VerdictRecord } from '../../../shared/verdict-types'

function r(overrides: Partial<VerdictRecord>): VerdictRecord {
  return {
    sessionId: 's',
    projectId: 'p',
    branch: 'b',
    runtime: 'claude',
    taskPrompt: { kind: 'full', text: 't' },
    outcome: 'merged',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('computeRuntimeStats', () => {
  it('groups records by runtime and counts outcomes', () => {
    const records = [
      r({ sessionId: '1', runtime: 'claude', outcome: 'merged' }),
      r({ sessionId: '2', runtime: 'claude', outcome: 'merged' }),
      r({ sessionId: '3', runtime: 'claude', outcome: 'discarded' }),
      r({ sessionId: '4', runtime: 'codex', outcome: 'merged' }),
    ]
    const stats = computeRuntimeStats(records)
    const claude = stats.find((s) => s.runtime === 'claude')!
    const codex = stats.find((s) => s.runtime === 'codex')!
    expect(claude.total).toBe(3)
    expect(claude.merged).toBe(2)
    expect(claude.discarded).toBe(1)
    expect(claude.mergedPct).toBe(67)
    expect(claude.discardedPct).toBe(33)
    expect(codex.total).toBe(1)
    expect(codex.mergedPct).toBe(100)
  })

  it('returns avgHumanEditsForMerged averaged only across merged records', () => {
    const records = [
      r({ sessionId: '1', runtime: 'claude', outcome: 'merged', metrics: { agentCommits: 0, humanEdits: 4, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
      r({ sessionId: '2', runtime: 'claude', outcome: 'merged', metrics: { agentCommits: 0, humanEdits: 2, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
      r({ sessionId: '3', runtime: 'claude', outcome: 'discarded', metrics: { agentCommits: 0, humanEdits: 99, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } }),
    ]
    const stats = computeRuntimeStats(records)
    expect(stats[0].avgHumanEditsForMerged).toBe(3)
  })

  it('returns 0 avg when no merged records', () => {
    const records = [r({ outcome: 'discarded' })]
    const stats = computeRuntimeStats(records)
    expect(stats[0].avgHumanEditsForMerged).toBe(0)
  })

  it('returns empty array for empty input', () => {
    expect(computeRuntimeStats([])).toEqual([])
  })

  it('sorts runtimes alphabetically', () => {
    const records = [
      r({ runtime: 'gemini' }),
      r({ runtime: 'claude' }),
      r({ runtime: 'codex' }),
    ]
    expect(computeRuntimeStats(records).map((s) => s.runtime)).toEqual(['claude', 'codex', 'gemini'])
  })
})

describe('computeOutcomeCounts', () => {
  it('counts each outcome category', () => {
    const records = [
      r({ outcome: 'merged' }),
      r({ outcome: 'merged' }),
      r({ outcome: 'pr_created' }),
      r({ outcome: 'committed_only' }),
      r({ outcome: 'discarded' }),
      r({ outcome: 'unknown' }),
    ]
    expect(computeOutcomeCounts(records)).toEqual({
      merged: 2,
      pr_created: 1,
      committed_only: 1,
      discarded: 1,
      unknown: 1,
    })
  })

  it('returns all zeros for empty input', () => {
    expect(computeOutcomeCounts([])).toEqual({
      merged: 0, pr_created: 0, committed_only: 0, discarded: 0, unknown: 0,
    })
  })
})

describe('sortRecentFirst', () => {
  it('returns records sorted by createdAt descending', () => {
    const records = [
      r({ sessionId: 'old', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'new', createdAt: '2026-05-16T00:00:00Z' }),
      r({ sessionId: 'mid', createdAt: '2026-05-15T12:00:00Z' }),
    ]
    expect(sortRecentFirst(records).map((r) => r.sessionId)).toEqual(['new', 'mid', 'old'])
  })

  it('does not mutate input', () => {
    const records = [
      r({ sessionId: 'a', createdAt: '2026-05-15T00:00:00Z' }),
      r({ sessionId: 'b', createdAt: '2026-05-16T00:00:00Z' }),
    ]
    const before = records.map((r) => r.sessionId)
    sortRecentFirst(records)
    expect(records.map((r) => r.sessionId)).toEqual(before)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/components/verdicts/verdict-aggregates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `verdict-aggregates.ts`**

```ts
// src/renderer/components/verdicts/verdict-aggregates.ts
import type { VerdictRecord, VerdictOutcome } from '../../../shared/verdict-types'

export interface RuntimeStats {
  runtime: string
  total: number
  merged: number
  discarded: number
  mergedPct: number
  discardedPct: number
  avgHumanEditsForMerged: number
}

export interface OutcomeCounts {
  merged: number
  pr_created: number
  committed_only: number
  discarded: number
  unknown: number
}

export function computeRuntimeStats(records: VerdictRecord[]): RuntimeStats[] {
  const byRuntime = new Map<string, VerdictRecord[]>()
  for (const record of records) {
    const bucket = byRuntime.get(record.runtime) ?? []
    bucket.push(record)
    byRuntime.set(record.runtime, bucket)
  }

  const stats: RuntimeStats[] = []
  for (const [runtime, bucket] of byRuntime) {
    const total = bucket.length
    const merged = bucket.filter((r) => r.outcome === 'merged')
    const discarded = bucket.filter((r) => r.outcome === 'discarded').length
    const editsSum = merged.reduce((sum, r) => sum + r.metrics.humanEdits, 0)
    stats.push({
      runtime,
      total,
      merged: merged.length,
      discarded,
      mergedPct: total === 0 ? 0 : Math.round((merged.length / total) * 100),
      discardedPct: total === 0 ? 0 : Math.round((discarded / total) * 100),
      avgHumanEditsForMerged: merged.length === 0 ? 0 : editsSum / merged.length,
    })
  }

  return stats.sort((left, right) => left.runtime.localeCompare(right.runtime))
}

export function computeOutcomeCounts(records: VerdictRecord[]): OutcomeCounts {
  const counts: OutcomeCounts = { merged: 0, pr_created: 0, committed_only: 0, discarded: 0, unknown: 0 }
  for (const record of records) {
    const key: VerdictOutcome = record.outcome
    counts[key]++
  }
  return counts
}

export function sortRecentFirst(records: VerdictRecord[]): VerdictRecord[] {
  return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/renderer/components/verdicts/verdict-aggregates.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/verdicts/verdict-aggregates.ts src/renderer/components/verdicts/verdict-aggregates.test.ts
git commit -m "Add pure verdict aggregator (runtime stats, outcome counts, sort)"
```

---

## Task 3: Implement `useVerdicts` hook with tests

**Files:**
- Create: `src/renderer/hooks/useVerdicts.ts`
- Create: `src/renderer/hooks/useVerdicts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/renderer/hooks/useVerdicts.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke }
})

import { useVerdicts } from './useVerdicts'

describe('useVerdicts', () => {
  it('returns empty state and does not call IPC when projectId is null', () => {
    const { result } = renderHook(() => useVerdicts(null))
    expect(result.current.records).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('fetches records for a project id', async () => {
    mockInvoke.mockResolvedValue([
      { sessionId: 's1', projectId: 'p1', branch: 'b', runtime: 'claude', taskPrompt: { kind: 'full', text: 't' }, outcome: 'merged', createdAt: '2026-05-16', metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 } },
    ])
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.records.length).toBe(1)
    expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p1' })
  })

  it('exposes error string when IPC rejects', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC fail'))
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.error).toBe('IPC fail'))
    expect(result.current.records).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('refresh re-invokes IPC', async () => {
    mockInvoke.mockResolvedValue([])
    const { result } = renderHook(() => useVerdicts('p1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockInvoke).toHaveBeenCalledTimes(1)
    await act(async () => { await result.current.refresh() })
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('re-fetches when projectId changes', async () => {
    mockInvoke.mockResolvedValue([])
    const { rerender } = renderHook(({ id }: { id: string | null }) => useVerdicts(id), {
      initialProps: { id: 'p1' },
    })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p1' }))
    rerender({ id: 'p2' })
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('verdicts:list', { projectId: 'p2' }))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/hooks/useVerdicts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useVerdicts.ts`**

```ts
// src/renderer/hooks/useVerdicts.ts
import { useCallback, useEffect, useState } from 'react'
import type { VerdictRecord } from '../../shared/verdict-types'

export interface UseVerdictsResult {
  records: VerdictRecord[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useVerdicts(projectId: string | null): UseVerdictsResult {
  const [records, setRecords] = useState<VerdictRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecords = useCallback(async (): Promise<void> => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const result = (await window.electronAPI.invoke('verdicts:list', { projectId })) as VerdictRecord[]
      setRecords(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId) {
      setRecords([])
      setError(null)
      return
    }
    void fetchRecords()
  }, [projectId, fetchRecords])

  return { records, loading, error, refresh: fetchRecords }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/renderer/hooks/useVerdicts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useVerdicts.ts src/renderer/hooks/useVerdicts.test.ts
git commit -m "Add useVerdicts hook backed by verdicts:list IPC"
```

---

## Task 4: Implement `VerdictsPanel` component with tests

**Files:**
- Create: `src/renderer/components/verdicts/VerdictsPanel.tsx`
- Create: `src/renderer/components/verdicts/VerdictsPanel.styles.ts`
- Create: `src/renderer/components/verdicts/VerdictsPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/renderer/components/verdicts/VerdictsPanel.test.tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DockStateContext, type DockAppState } from '../editor/dock-panel-types'
import { VerdictsPanel } from './VerdictsPanel'
import type { VerdictRecord } from '../../../shared/verdict-types'

const mockInvoke = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  ;(window as unknown as Record<string, unknown>).electronAPI = { invoke: mockInvoke }
})

function renderWith(activeProjectId: string | null): void {
  const state = { activeProjectId } as DockAppState
  render(<DockStateContext.Provider value={state}><VerdictsPanel /></DockStateContext.Provider>)
}

function record(overrides: Partial<VerdictRecord>): VerdictRecord {
  return {
    sessionId: 's', projectId: 'p1', branch: 'b', runtime: 'claude',
    taskPrompt: { kind: 'full', text: 'do the thing' }, outcome: 'merged',
    createdAt: '2026-05-16T00:00:00.000Z',
    metrics: { agentCommits: 0, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0 },
    ...overrides,
  }
}

describe('VerdictsPanel', () => {
  it('shows empty state when there are no records', async () => {
    mockInvoke.mockResolvedValue([])
    renderWith('p1')
    await waitFor(() => expect(screen.getByText(/no sessions captured yet/i)).toBeTruthy())
  })

  it('shows empty state when no active project', () => {
    renderWith(null)
    expect(screen.getByText(/no sessions captured yet/i)).toBeTruthy()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('renders per-runtime stats and recent sessions', async () => {
    mockInvoke.mockResolvedValue([
      record({ sessionId: 'a', runtime: 'claude', outcome: 'merged', createdAt: '2026-05-16T01:00:00Z' }),
      record({ sessionId: 'b', runtime: 'codex', outcome: 'discarded', createdAt: '2026-05-16T02:00:00Z', taskPrompt: { kind: 'full', text: 'fix bug' } }),
    ])
    renderWith('p1')
    await waitFor(() => expect(screen.getByText('claude')).toBeTruthy())
    expect(screen.getByText('codex')).toBeTruthy()
    expect(screen.getByText('fix bug')).toBeTruthy()
  })

  it('shows error message on IPC failure', async () => {
    mockInvoke.mockRejectedValue(new Error('boom'))
    renderWith('p1')
    await waitFor(() => expect(screen.getByText(/boom/)).toBeTruthy())
  })

  it('refresh button re-invokes IPC', async () => {
    mockInvoke.mockResolvedValue([])
    renderWith('p1')
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2))
  })

  it('renders prUrl as link when present', async () => {
    mockInvoke.mockResolvedValue([
      record({
        sessionId: 'p', outcome: 'pr_created',
        metrics: { agentCommits: 1, humanEdits: 0, diffLines: { added: 0, removed: 0 }, filesChanged: 0, prUrl: 'https://github.com/o/r/pull/1' },
      }),
    ])
    renderWith('p1')
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /PR/i }) as HTMLAnchorElement
      expect(link.href).toBe('https://github.com/o/r/pull/1')
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/components/verdicts/VerdictsPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `VerdictsPanel.styles.ts`**

```ts
// src/renderer/components/verdicts/VerdictsPanel.styles.ts
import type React from 'react'

export const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto', padding: 16, gap: 16, fontSize: 13, color: 'var(--text-default)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: 600 },
  refreshButton: { padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-default)', cursor: 'pointer' },
  sectionTitle: { fontSize: 12, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.4 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, opacity: 0.75 },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' },
  emptyState: { padding: 24, textAlign: 'center', color: 'var(--text-muted)' },
  errorBox: { padding: 12, border: '1px solid var(--border-error, #d44)', color: 'var(--text-error, #d44)', borderRadius: 4 },
  outcomeFooter: { fontSize: 12, opacity: 0.7 },
  prLink: { color: 'var(--text-link, #4af)', textDecoration: 'underline' },
  promptCell: { maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
```

- [ ] **Step 4: Implement `VerdictsPanel.tsx`**

```tsx
// src/renderer/components/verdicts/VerdictsPanel.tsx
import React from 'react'
import { useDockState } from '../editor/dock-panel-types'
import { useVerdicts } from '../../hooks/useVerdicts'
import { computeOutcomeCounts, computeRuntimeStats, sortRecentFirst } from './verdict-aggregates'
import { styles } from './VerdictsPanel.styles'
import type { VerdictRecord, TaskPrompt } from '../../../shared/verdict-types'

const RECENT_LIMIT = 50
const PROMPT_PREVIEW_CHARS = 80

export function VerdictsPanel(): React.JSX.Element {
  const dockState = useDockState()
  const projectId = dockState.activeProjectId
  const { records, loading, error, refresh } = useVerdicts(projectId)

  if (!projectId || (!loading && records.length === 0 && !error)) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No sessions captured yet — they'll show up here when you spawn agents.</div>
      </div>
    )
  }

  const runtimeStats = computeRuntimeStats(records)
  const outcomeCounts = computeOutcomeCounts(records)
  const recent = sortRecentFirst(records).slice(0, RECENT_LIMIT)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Verdicts</span>
        <button type="button" style={styles.refreshButton} onClick={() => { void refresh() }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div style={styles.errorBox}>Failed to load verdicts: {error}</div>}

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
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/renderer/components/verdicts/VerdictsPanel.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/verdicts/VerdictsPanel.tsx src/renderer/components/verdicts/VerdictsPanel.styles.ts src/renderer/components/verdicts/VerdictsPanel.test.tsx
git commit -m "Add VerdictsPanel rendering aggregates and recent sessions"
```

---

## Task 5: Register `verdicts` in dock layout helpers

**Files:**
- Modify: `src/renderer/hooks/dock-layout-helpers.ts`

- [ ] **Step 1: Extend `PANEL_IDS`**

In `src/renderer/hooks/dock-layout-helpers.ts`, change line 13 from:

```ts
export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'search', 'backgroundAgent', 'loop', 'watch'] as const
```

To:

```ts
export const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell', 'search', 'backgroundAgent', 'loop', 'watch', 'verdicts'] as const
```

- [ ] **Step 2: Extend `PANEL_TITLES`**

Add to the `PANEL_TITLES` record (after `watch: 'Watch'`):

```ts
  verdicts: 'Verdicts',
```

- [ ] **Step 3: Extend `PANEL_RESTORE_HINTS`**

Add to the `PANEL_RESTORE_HINTS` record (after the `watch` entry):

```ts
  verdicts: [{ ref: 'editor', dir: 'within' }, { ref: 'agent', dir: 'within' }, { ref: 'search', dir: 'within' }, { ref: 'backgroundAgent', dir: 'within' }],
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS (no new errors).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/dock-layout-helpers.ts
git commit -m "Register 'verdicts' panel id, title, and restore hints"
```

---

## Task 6: Add gated registration in `applyDefaultLayout`

**Files:**
- Modify: `src/renderer/hooks/dock-layout-builders.ts`

- [ ] **Step 1: Extend `DefaultLayoutOptions`**

In `src/renderer/hooks/dock-layout-builders.ts`, change:

```ts
interface DefaultLayoutOptions {
  showIdeasTab: boolean
  showLoopTab: boolean
}
```

To:

```ts
interface DefaultLayoutOptions {
  showIdeasTab: boolean
  showLoopTab: boolean
  showVerdictsTab: boolean
}
```

- [ ] **Step 2: Add the gated `addPanel` call**

In `applyDefaultLayout`, after the existing `showLoopTab` block (the `if (options.showLoopTab) { ... }` chunk around line 53–61), add:

```ts
  if (options.showVerdictsTab) {
    api.addPanel({
      id: 'verdicts',
      component: 'verdicts',
      title: PANEL_TITLES.verdicts,
      inactive: true,
      position: { referencePanel: 'agent', direction: 'within' },
    })
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS. New errors point to `applyDefaultLayout` callers missing `showVerdictsTab` — those get fixed in Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/dock-layout-builders.ts
git commit -m "Add gated Verdicts panel to default layout builder"
```

---

## Task 7: Plumb `showVerdictsTab` through `useDockLayout`

**Files:**
- Modify: `src/renderer/hooks/useDockLayout.ts`

The pattern is identical to `showLoopTab`. Each step mirrors the loop equivalent.

- [ ] **Step 1: Add the parameter**

Change the `useDockLayout` signature from:

```ts
export function useDockLayout(
  sessionId: string | null,
  showIdeasTab: boolean,
  showLoopTab: boolean,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
```

To:

```ts
export function useDockLayout(
  sessionId: string | null,
  showIdeasTab: boolean,
  showLoopTab: boolean,
  showVerdictsTab: boolean,
  liveSessions: AgentSession[] = [],
): UseDockLayoutResult {
```

- [ ] **Step 2: Add the ref**

After the `showLoopTabRef` declarations (around line 60 and 66), add:

```ts
  const showVerdictsTabRef = useRef(showVerdictsTab)
```

and

```ts
  showVerdictsTabRef.current = showVerdictsTab
```

- [ ] **Step 3: Forward to `applyDefaultLayout`**

Change `buildDefaultLayout`:

```ts
  const buildDefaultLayout = useCallback((api: DockviewApi) => applyDefaultLayout(api, { showIdeasTab, showLoopTab, showVerdictsTab }), [showIdeasTab, showLoopTab, showVerdictsTab])
```

- [ ] **Step 4: Add `applyVerdictsTabSetting`**

After `applyLoopTabSetting` (ends around line 150), add an identical callback for verdicts:

```ts
  const applyVerdictsTabSetting = useCallback((api: DockviewApi, showOnEnable: boolean): boolean => {
    if (!sessionIdRef.current) return false

    const verdictsPanel = api.getPanel('verdicts')
    if (!showVerdictsTabRef.current) {
      if (!verdictsPanel) return false
      hidePanel(api, 'verdicts', closedPanelSnapshots, refs)
      return true
    }

    if (!showOnEnable || verdictsPanel) return false

    const snapshot = closedPanelSnapshots.current.get('verdicts')
    if (snapshot) {
      showPanelFromSnapshot(api, 'verdicts', snapshot, closedPanelSnapshots, refs)
    } else {
      showPanelFromHints(api, 'verdicts', refs)
    }
    return true
  }, [refs])
```

- [ ] **Step 5: Call it during layout load**

In the `onReady` callback (around lines 193–194), where `applyIdeasTabSetting` and `applyLoopTabSetting` are called, add:

```ts
        const verdictsChanged = applyVerdictsTabSetting(api, false)
```

The original code reads:

```ts
        const ideasChanged = applyIdeasTabSetting(api, false)
        const loopChanged = applyLoopTabSetting(api, false)
        syncPanels(api)
```

The new code reads:

```ts
        const ideasChanged = applyIdeasTabSetting(api, false)
        const loopChanged = applyLoopTabSetting(api, false)
        const verdictsChanged = applyVerdictsTabSetting(api, false)
        syncPanels(api)
```

If the subsequent code checks any of these `*Changed` flags as a single boolean (e.g., `if (ideasChanged || loopChanged)`), add `|| verdictsChanged`. If they are only used for `void`, you can prefix with `void` like the others.

- [ ] **Step 6: Do the same in the second invocation site**

Around lines 275–276 there is a second call site mirroring step 5. Apply the identical insertion.

- [ ] **Step 7: Add the change-effect**

After the `previousShowLoopTabRef` `useEffect` (ends around line 328), add:

```ts
  const previousShowVerdictsTabRef = useRef(showVerdictsTab)
  useEffect(() => {
    const previous = previousShowVerdictsTabRef.current
    previousShowVerdictsTabRef.current = showVerdictsTab
    if (previous === showVerdictsTab) return

    const api = apiRef.current
    if (!api || !sessionIdRef.current) return

    const visibilityChanged = applyVerdictsTabSetting(api, showVerdictsTab)
    if (!visibilityChanged) {
      bumpVersion()
      return
    }

    syncPanels(api)
    lastLayoutRef.current = api.toJSON()
    saveLayout()
    bumpVersion()
  }, [applyVerdictsTabSetting, bumpVersion, saveLayout, showVerdictsTab, syncPanels])
```

- [ ] **Step 8: Update dependency arrays**

There are two dependency arrays referencing `applyLoopTabSetting`. Find each one (around lines 251 and 286) and add `applyVerdictsTabSetting` to it.

- [ ] **Step 9: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS. Remaining error is in `App.tsx` (caller missing parameter) — fixed in Task 9.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/hooks/useDockLayout.ts
git commit -m "Plumb showVerdictsTab through useDockLayout"
```

---

## Task 8: Register `VerdictsPanel` in `PANEL_COMPONENTS`

**Files:**
- Modify: `src/renderer/components/editor/dock-panels.tsx`

- [ ] **Step 1: Add the import**

Near the existing `import { LoopPanel } from '../loop/LoopPanel'` line, add:

```ts
import { VerdictsPanel } from '../verdicts/VerdictsPanel'
```

- [ ] **Step 2: Register in `PANEL_COMPONENTS`**

In the `PANEL_COMPONENTS` object literal (around line 24–36), after `loop: LoopPanel,`, add:

```ts
  verdicts: VerdictsPanel,
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS (no new errors from this change).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/editor/dock-panels.tsx
git commit -m "Register VerdictsPanel in dockview component map"
```

---

## Task 9: Pass `settings.showVerdictsTab` from App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Update the `useDockLayout` call**

Change line 96 from:

```ts
  const dockLayout = useDockLayout(dockLayoutKey, settings.showIdeasTab, settings.showLoopTab, activeProjectSessions)
```

To:

```ts
  const dockLayout = useDockLayout(dockLayoutKey, settings.showIdeasTab, settings.showLoopTab, settings.showVerdictsTab, activeProjectSessions)
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS — error count returns to baseline.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "Pass settings.showVerdictsTab to useDockLayout"
```

---

## Task 10: Add Settings UI for the toggle

**Files:**
- Modify: `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`
- Modify: `src/renderer/components/modals/settings/SettingsModalBody.tsx`
- Modify: `src/renderer/components/modals/SettingsModal.tsx`

- [ ] **Step 1: Extend `GeneralSettingsSection` props**

In `src/renderer/components/modals/settings/GeneralSettingsSection.tsx`:

After `onShowLoopTabChange: (enabled: boolean) => void` in the `Props` interface (around line 21), add:

```ts
  showVerdictsTab: boolean
  onShowVerdictsTabChange: (enabled: boolean) => void
```

After the "Show Loop tab" `<label>` block (ends around line 95), add a parallel block:

```tsx
            <label style={{ ...modalStyles.checkboxField, ...modalStyles.fieldSpanFull }}>
              <input type="checkbox" checked={props.showVerdictsTab} onChange={(event) => props.onShowVerdictsTabChange(event.target.checked)} style={modalStyles.checkboxInput} />
              Show Verdicts tab
              <span style={modalStyles.helpText}>Adds a Verdicts panel showing per-runtime quality metrics and recent sessions.</span>
            </label>
```

- [ ] **Step 2: Thread props through `SettingsModalBody`**

In `src/renderer/components/modals/settings/SettingsModalBody.tsx`:

Add to the `Props` interface (after `onShowLoopTabChange`):

```ts
  showVerdictsTab: boolean
  onShowVerdictsTabChange: (enabled: boolean) => void
```

The `GeneralSettingsSection` is rendered with `{...props}` so no additional change is needed in the JSX.

- [ ] **Step 3: Wire state in `SettingsModal`**

In `src/renderer/components/modals/SettingsModal.tsx`:

After `const [showLoopTab, setShowLoopTab] = useState(settings.showLoopTab)` (line 21), add:

```ts
  const [showVerdictsTab, setShowVerdictsTab] = useState(settings.showVerdictsTab)
```

In the `useEffect` that resets state when settings change, after `setShowLoopTab(settings.showLoopTab)` (line 54), add:

```ts
    setShowVerdictsTab(settings.showVerdictsTab)
```

In `handleSave`'s `onSave({ ... })` payload (after `showLoopTab,` on line 87), add:

```ts
      showVerdictsTab,
```

In the `useCallback` dependency array on line 108, add `showVerdictsTab` after `showLoopTab`.

In the JSX `<SettingsModalBody>` props (after `onShowLoopTabChange={setShowLoopTab}` around line 142), add:

```tsx
          showVerdictsTab={showVerdictsTab}
          onShowVerdictsTabChange={setShowVerdictsTab}
```

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck:web`
Expected: PASS — error count at baseline.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/settings/GeneralSettingsSection.tsx src/renderer/components/modals/settings/SettingsModalBody.tsx src/renderer/components/modals/SettingsModal.tsx
git commit -m "Add 'Show Verdicts tab' checkbox to settings"
```

---

## Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run typechecks**

Run: `npm run typecheck:node && npm run typecheck:web`
Expected: PASS — error counts match the pre-feature baseline (20 node, 23 web). New code must not contribute additional errors.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: PASS, no regressions, new tests included.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
- Open Settings → General → confirm "Show Verdicts tab" checkbox is present and off by default.
- Enable it and save. Confirm the "Verdicts" tab appears in the agent group.
- Click the tab. With no records, expect "No sessions captured yet…" empty state.
- After spawning and killing an agent, hit Refresh. Expect a row in "Recent sessions".
- Toggle the checkbox off in Settings. Confirm the tab disappears without errors.

- [ ] **Step 4: Final commit if any cleanup**

```bash
git status
# If anything needs tweaking:
git add -A
git commit -m "Verdicts dashboard: cleanup and final verification"
```

---

## Self-Review Checklist Results

**Spec coverage:**
- ✅ `showVerdictsTab` setting — Task 1
- ✅ Hidden by default — Task 1 (`DEFAULT_SETTINGS`)
- ✅ Settings dialog checkbox mirroring `showLoopTab` — Task 10
- ✅ Tab content with three sections (header, per-runtime table, recent sessions, footer) — Task 4
- ✅ Refresh button — Task 4
- ✅ Empty state — Task 4
- ✅ Error state — Task 4
- ✅ PR URL link via `<a target="_blank">` (matching `WebPreview.tsx` / `useTerminal.ts` pattern) — Task 4
- ✅ Aggregation logic in pure module — Task 2
- ✅ `useVerdicts` hook calling `verdicts:list` IPC — Task 3
- ✅ Dock layout integration (`PANEL_IDS`, `PANEL_TITLES`, `PANEL_RESTORE_HINTS`) — Task 5
- ✅ Gated registration in `applyDefaultLayout` — Task 6
- ✅ `useDockLayout` parameter + apply setting — Task 7
- ✅ `PANEL_COMPONENTS` registration — Task 8
- ✅ App.tsx wiring — Task 9

**Placeholder scan:** none.

**Type consistency:** `VerdictRecord`, `TaskPrompt`, `RuntimeStats`, `OutcomeCounts`, `UseVerdictsResult` are defined once and referenced consistently across tasks. `showVerdictsTab` setter / state names match across all settings tasks.
