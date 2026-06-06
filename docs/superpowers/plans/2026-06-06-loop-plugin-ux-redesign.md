# Loop Plugin UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the Autoresearch Loop webview panel — refined single-flow config form, segmented metric selector, sentence-case labels, a consolidated live-run card, a score-trend strip, and a best-highlighted iteration timeline — with zero engine/protocol changes.

**Architecture:** Presentation-only changes under `resources/plugins/manifold.loop/src/webview/`. Pure view logic (elapsed formatting, best-iteration detection, trend normalization) is extracted into a tested `run-view.ts` helper module. The growing `LoopConfigForm` is decomposed into `SegmentedControl`, `ScoringFields`, and `AdvancedSection`; the running state moves into a new `LiveRunCard`; the trend into `ScoreTrend`. `LoopPanel` becomes a thin idle-vs-running router. All colors are `var(--token)`; structure is theme-agnostic.

**Tech Stack:** React (webview), inline `React.CSSProperties` style objects merged via `styles/index.ts`, vitest + jsdom + @testing-library/react for tests, esbuild via `npm run build:plugins`, tsc via `npm run typecheck:plugins`.

---

## File Structure

Under `resources/plugins/manifold.loop/src/webview/`:

**Create:**
- `run-view.ts` — pure helpers: `formatElapsed`, `bestIterationIndex`, `computeTrend` (+ `TrendBar` type).
- `run-view.test.ts` — unit tests for the above.
- `components/SegmentedControl.tsx` — reusable pill selector.
- `components/SegmentedControl.test.tsx` — selection + keyboard test.
- `components/ScoringFields.tsx` — segmented metric + metric-dependent fields.
- `components/AdvancedSection.tsx` — the Advanced `<details>` block.
- `components/LiveRunCard.tsx` — running-state card (replaces status bar + PendingIterationCard).
- `components/ScoreTrend.tsx` — bar-trend strip.
- `styles/liverun.styles.ts` — live-card + trend styles (keeps `panel.styles.ts` under 300 LOC).

**Modify:**
- `styles/form.styles.ts` — sentence-case label style, section header, divider, segmented control, AI chip restyle.
- `styles/iteration.styles.ts` — outcome left-border + best-row highlight.
- `styles/index.ts` — merge `liverunStyles`.
- `components/LoopConfigForm.tsx` — slim idle-form composition.
- `components/LoopIterationList.tsx` — restyle rows; accept `bestIndex`.
- `components/LoopPanel.tsx` — idle-vs-running router; render intro/empty/trend/history.
- `keyframes.ts` — none expected (reuse existing); only touch if a needed keyframe is missing.

**Untouched:** `helpers.ts`, `protocol.ts`, `use-loop-bridge.ts`, `loop-state.ts`, `index.tsx`, all of `src/` (engine/host), `types.ts`.

---

## Task 1: Pure run-view helpers (TDD)

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/run-view.ts`
- Test: `resources/plugins/manifold.loop/src/webview/run-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// resources/plugins/manifold.loop/src/webview/run-view.test.ts
import { describe, it, expect } from 'vitest'
import { formatElapsed, bestIterationIndex, computeTrend } from './run-view'
import type { LoopIteration, MetricSpec } from '../types'

const iter = (index: number, score: number | undefined, outcome: LoopIteration['outcome'], commitSha?: string): LoopIteration =>
  ({ index, startedAt: 0, finishedAt: 1, score, outcome, commitSha })

describe('formatElapsed', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(125_000)).toBe('2:05')
  })
  it('clamps negative input to 0:00', () => {
    expect(formatElapsed(-5)).toBe('0:00')
  })
})

describe('bestIterationIndex', () => {
  it('returns the index of the iteration whose commit matches bestCommitSha', () => {
    const iters = [iter(1, 5, 'improved', 'aaa'), iter(2, 8, 'improved', 'bbb')]
    expect(bestIterationIndex(iters, 'bbb')).toBe(2)
  })
  it('returns null when no commit matches or bestCommitSha is missing', () => {
    const iters = [iter(1, 5, 'improved', 'aaa')]
    expect(bestIterationIndex(iters, 'zzz')).toBeNull()
    expect(bestIterationIndex(iters, undefined)).toBeNull()
  })
})

describe('computeTrend', () => {
  const judge: MetricSpec = { kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' }
  const timing: MetricSpec = { kind: 'json-path', path: 'p', direction: 'minimize' }

  it('returns [] with fewer than two scored iterations', () => {
    expect(computeTrend([iter(1, 5, 'improved', 'a')], judge, 'a')).toEqual([])
  })
  it('maximize: higher score is the taller bar; best matches bestCommitSha', () => {
    const bars = computeTrend([iter(1, 4, 'improved', 'a'), iter(2, 8, 'improved', 'b')], judge, 'b')
    expect(bars.map((b) => b.index)).toEqual([1, 2])
    expect(bars[1].heightPct).toBeGreaterThan(bars[0].heightPct)
    expect(bars[1].isBest).toBe(true)
    expect(bars[0].isBest).toBe(false)
  })
  it('minimize: lower score is the taller bar', () => {
    const bars = computeTrend([iter(1, 100, 'improved', 'a'), iter(2, 40, 'improved', 'b')], timing, 'b')
    expect(bars[1].heightPct).toBeGreaterThan(bars[0].heightPct)
  })
  it('skips iterations without a score and sorts by index ascending', () => {
    const bars = computeTrend([iter(3, 6, 'improved', 'c'), iter(1, undefined, 'failed'), iter(2, 9, 'improved', 'b')], judge, 'b')
    expect(bars.map((b) => b.index)).toEqual([2, 3])
  })
  it('gives every bar a visible minimum height even at the bottom of the range', () => {
    const bars = computeTrend([iter(1, 0, 'improved', 'a'), iter(2, 10, 'improved', 'b')], judge, 'b')
    expect(bars[0].heightPct).toBeGreaterThanOrEqual(0.12)
    expect(bars[1].heightPct).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/run-view.test.ts`
Expected: FAIL — `Failed to resolve import "./run-view"`.

- [ ] **Step 3: Write the implementation**

```ts
// resources/plugins/manifold.loop/src/webview/run-view.ts
// Pure view-logic for the running state: timer formatting, best-iteration
// detection, and score-trend normalization. Kept separate from JSX so it is
// unit-testable (see run-view.test.ts) and reusable by LiveRunCard/ScoreTrend.
import type { LoopIteration, MetricSpec } from '../types'

/** Wall-clock elapsed (ms) → "m:ss". Negatives clamp to 0:00. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** The `index` of the iteration whose commit is the current best, or null. */
export function bestIterationIndex(iterations: LoopIteration[], bestCommitSha: string | undefined): number | null {
  if (!bestCommitSha) return null
  const hit = iterations.find((it) => it.commitSha && it.commitSha === bestCommitSha)
  return hit ? hit.index : null
}

export interface TrendBar {
  index: number
  score: number
  /** Normalized 0.12–1, where taller is always "better" for the metric direction. */
  heightPct: number
  isBest: boolean
  outcome: LoopIteration['outcome']
}

const MIN_BAR = 0.12

/** Build chronological trend bars from scored iterations. Returns [] for <2 scored
 *  iterations so the caller can hide the strip. Bars are normalized so the visually
 *  tallest bar is always the best attempt, regardless of minimize/maximize. */
export function computeTrend(iterations: LoopIteration[], metric: MetricSpec, bestCommitSha: string | undefined): TrendBar[] {
  const scored = iterations
    .filter((it): it is LoopIteration & { score: number } => typeof it.score === 'number')
    .sort((a, b) => a.index - b.index)
  if (scored.length < 2) return []

  const scores = scored.map((it) => it.score)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const span = max - min
  const maximize = metric.direction === 'maximize'

  return scored.map((it) => {
    // goodness in 0..1, higher = better for this metric
    const goodness = span === 0 ? 1 : maximize ? (it.score - min) / span : (max - it.score) / span
    const heightPct = MIN_BAR + goodness * (1 - MIN_BAR)
    return {
      index: it.index,
      score: it.score,
      heightPct,
      isBest: !!bestCommitSha && it.commitSha === bestCommitSha,
      outcome: it.outcome,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/run-view.test.ts`
Expected: PASS (10 assertions across 3 describes).

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/run-view.ts resources/plugins/manifold.loop/src/webview/run-view.test.ts
git commit -m "feat(loop): pure run-view helpers (elapsed, best-iteration, trend)"
```

---

## Task 2: SegmentedControl component (TDD)

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/components/SegmentedControl.tsx`
- Test: `resources/plugins/manifold.loop/src/webview/components/SegmentedControl.test.tsx`
- Modify: `resources/plugins/manifold.loop/src/webview/styles/form.styles.ts` (add `segment*` styles in Task 3; this task adds the component which references `S.segmentGroup`/`S.segment`/`S.segmentActive` — add minimal versions here if Task 3 not yet done).

- [ ] **Step 1: Write the failing test**

```tsx
// resources/plugins/manifold.loop/src/webview/components/SegmentedControl.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentedControl } from './SegmentedControl'

const OPTS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

describe('SegmentedControl', () => {
  it('marks the active option with aria-checked and calls onChange on click', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="b" onChange={onChange} ariaLabel="Pick" />)
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('moves selection with ArrowRight/ArrowLeft (wrapping)', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="c" onChange={onChange} ariaLabel="Pick" />)
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('a') // wraps c -> a
    onChange.mockClear()
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('b') // c -> b
  })

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTS} value="a" onChange={onChange} ariaLabel="Pick" disabled />)
    fireEvent.click(screen.getByRole('radio', { name: 'Beta' }))
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/components/SegmentedControl.test.tsx`
Expected: FAIL — cannot resolve `./SegmentedControl`.

- [ ] **Step 3: Write the implementation**

```tsx
// resources/plugins/manifold.loop/src/webview/components/SegmentedControl.tsx
import React from 'react'
import { loopPanelStyles as S } from '../styles'

export interface SegmentOption<T extends string> { value: T; label: string }

interface Props<T extends string> {
  options: ReadonlyArray<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  disabled?: boolean
}

/** Accessible segmented pill selector (radiogroup). Replaces a <select> while keeping
 *  keyboard parity: Arrow keys move (and wrap) the selection; click selects. */
export function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel, disabled }: Props<T>): React.JSX.Element {
  function move(delta: number): void {
    if (disabled) return
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + delta + options.length) % options.length]
    if (next && next.value !== value) onChange(next.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ ...S.segmentGroup, ...(disabled ? S.segmentGroupDisabled : null) }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(o.value) }}
            style={{ ...S.segment, ...(active ? S.segmentActive : null) }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Add the styles this component references**

Add to `resources/plugins/manifold.loop/src/webview/styles/form.styles.ts` inside `formStyles`:

```ts
  segmentGroup: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap',
  },
  segmentGroupDisabled: {
    opacity: 0.6,
  },
  segment: {
    background: 'var(--bg-input)',
    border: '1px solid var(--control-border)',
    color: 'var(--text-secondary)',
    borderRadius: 'var(--radius-pill)',
    padding: '5px 12px',
    fontSize: 'var(--type-ui-small)',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  segmentActive: {
    background: 'var(--accent)',
    borderColor: 'var(--accent)',
    color: 'var(--accent-text)',
    fontWeight: 600,
  },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/components/SegmentedControl.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/SegmentedControl.tsx resources/plugins/manifold.loop/src/webview/components/SegmentedControl.test.tsx resources/plugins/manifold.loop/src/webview/styles/form.styles.ts
git commit -m "feat(loop): accessible SegmentedControl with keyboard parity"
```

---

## Task 3: Form style refresh (labels, sections, AI chip, divider)

**Files:**
- Modify: `resources/plugins/manifold.loop/src/webview/styles/form.styles.ts`

- [ ] **Step 1: Add/replace the following keys in `formStyles`**

Replace the `label` style and add new keys (keep all other existing keys, including the `segment*` keys from Task 2):

```ts
  // sentence-case field label (was all-caps mono)
  label: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    fontWeight: 500,
  },
  // small uppercase section header (Task / Scoring / Advanced)
  sectionHeader: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 600,
    margin: '0 0 var(--space-xs)',
  },
  groupDivider: {
    height: 1,
    background: 'var(--divider)',
    border: 'none',
    margin: 'var(--space-sm) 0',
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
```

Update the `aiButton` key so the chip reads as a pill (replace its `borderRadius` and add a subtle accent background):

```ts
  aiButton: {
    background: 'var(--accent-subtle)',
    border: '1px solid var(--accent-subtle)',
    color: 'var(--accent)',
    borderRadius: 'var(--radius-pill)',
    padding: '2px 10px',
    fontSize: 'var(--type-ui-caption)',
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    transition: 'background 150ms ease, color 150ms ease',
  },
```

Make the `program` and `judgeRubric` textareas prose-friendly by adding a sans variant key (used by those two fields in Task 6):

```ts
  textareaProse: {
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    fontSize: 'var(--type-ui-small)',
    fontFamily: 'var(--font-sans)',
    minHeight: 96,
    resize: 'vertical',
    lineHeight: 1.5,
  },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors (style objects are `React.CSSProperties`).

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/styles/form.styles.ts
git commit -m "feat(loop): modern form styles — sentence-case labels, section headers, AI chip"
```

---

## Task 4: ScoringFields component

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/components/ScoringFields.tsx`

This extracts the metric selector + all metric-dependent fields out of `LoopConfigForm`, using the new `SegmentedControl`.

- [ ] **Step 1: Write the component**

```tsx
// resources/plugins/manifold.loop/src/webview/components/ScoringFields.tsx
import React from 'react'
import type { MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import type { FormState } from '../helpers'
import { SegmentedControl } from './SegmentedControl'

const METRIC_OPTIONS: ReadonlyArray<{ value: MetricSpec['kind']; label: string }> = [
  { value: 'exit-code', label: 'Exit code' },
  { value: 'stdout-regex', label: 'Stdout regex' },
  { value: 'json-path', label: 'JSON path' },
  { value: 'llm-judge', label: 'LLM judge' },
]

interface Props {
  form: FormState
  disabled: boolean
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

export function ScoringFields({ form, disabled, update }: Props): React.JSX.Element {
  const isJudge = form.metricKind === 'llm-judge'
  const hasDirection = form.metricKind === 'stdout-regex' || form.metricKind === 'json-path'
  return (
    <div style={S.group}>
      <div style={S.field}>
        <label style={S.label}>How is each attempt scored?</label>
        <SegmentedControl
          options={METRIC_OPTIONS}
          value={form.metricKind}
          onChange={(v) => update('metricKind', v)}
          ariaLabel="Scoring metric"
          disabled={disabled}
        />
      </div>

      <div style={S.inputRow}>
        <div style={{ ...S.field, flex: 1 }}>
          <div style={S.labelRow}>
            <label style={S.label}>Eval command</label>
            {isJudge && <span style={S.labelHint}>optional — its stdout is passed to the judge</span>}
          </div>
          <input
            style={S.input}
            value={form.evalCommand}
            onChange={(e) => update('evalCommand', e.target.value)}
            disabled={disabled}
            placeholder={isJudge ? 'leave blank to judge the diff directly' : 'e.g. npm test'}
          />
        </div>
        {isJudge && (
          <div style={{ ...S.field, width: 96, flex: 'none' }}>
            <label style={S.label}>Max score</label>
            <input style={S.input} value={form.judgeMaxScore} onChange={(e) => update('judgeMaxScore', e.target.value)} disabled={disabled} inputMode="numeric" />
          </div>
        )}
        {hasDirection && (
          <div style={{ ...S.field, width: 130, flex: 'none' }}>
            <label style={S.label}>Direction</label>
            <select style={S.select} value={form.direction} onChange={(e) => update('direction', e.target.value as 'minimize' | 'maximize')} disabled={disabled}>
              <option value="minimize">Minimize</option>
              <option value="maximize">Maximize</option>
            </select>
          </div>
        )}
      </div>

      {form.metricKind === 'stdout-regex' && (
        <div style={S.field}>
          <label style={S.label}>Regex (capture group 1 = number)</label>
          <input style={S.input} value={form.pattern} onChange={(e) => update('pattern', e.target.value)} disabled={disabled} />
        </div>
      )}
      {form.metricKind === 'json-path' && (
        <div style={S.field}>
          <label style={S.label}>Dotted JSON path</label>
          <input style={S.input} value={form.jsonPath} onChange={(e) => update('jsonPath', e.target.value)} disabled={disabled} />
        </div>
      )}
      {isJudge && (
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>Judge rubric</label>
            <span style={S.labelHint}>0–{form.judgeMaxScore || '10'}, higher is better. Uses the default AI runtime.</span>
          </div>
          <textarea
            style={S.textareaProse}
            value={form.judgeRubric}
            onChange={(e) => update('judgeRubric', e.target.value)}
            disabled={disabled}
            placeholder="Describe the criteria the judge should apply when scoring each iteration."
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors. (Component is not yet imported; that happens in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/ScoringFields.tsx
git commit -m "feat(loop): extract ScoringFields with segmented metric selector"
```

---

## Task 5: AdvancedSection component

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/components/AdvancedSection.tsx`

- [ ] **Step 1: Write the component** (verbatim move of the Advanced `<details>` block out of `LoopConfigForm`)

```tsx
// resources/plugins/manifold.loop/src/webview/components/AdvancedSection.tsx
import React from 'react'
import { loopPanelStyles as S } from '../styles'
import type { FormState } from '../helpers'

interface Props {
  form: FormState
  disabled: boolean
  update: <K extends keyof FormState>(key: K, value: FormState[K]) => void
}

export function AdvancedSection({ form, disabled, update }: Props): React.JSX.Element {
  return (
    <details style={S.disclosure} open={form.alwaysAdvance}>
      <summary style={S.disclosureSummary}>Advanced</summary>
      <div style={S.disclosureBody}>
        <div style={S.inputRow}>
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Budget (seconds)</label>
            <input style={S.input} value={form.budgetSeconds} onChange={(e) => update('budgetSeconds', e.target.value)} disabled={disabled} />
          </div>
          <div style={{ ...S.field, flex: 1 }}>
            <label style={S.label}>Max iterations</label>
            <input style={S.input} value={form.maxIterations} onChange={(e) => update('maxIterations', e.target.value)} disabled={disabled} />
          </div>
        </div>

        <label style={S.checkboxRow}>
          <input type="checkbox" style={S.checkbox} checked={form.alwaysAdvance} onChange={(e) => update('alwaysAdvance', e.target.checked)} disabled={disabled} />
          <span style={S.checkboxLabel}>
            <span>Roll forward regardless of score</span>
            <span style={S.checkboxHint}>
              Commit every iteration&apos;s changes even when the score regresses. The best score is still tracked, but regressions are no longer reset to the previous commit.
            </span>
          </span>
        </label>

        <label style={S.checkboxRow}>
          <input type="checkbox" style={S.checkbox} checked={form.clearContextEachIteration} onChange={(e) => update('clearContextEachIteration', e.target.checked)} disabled={disabled} />
          <span style={S.checkboxLabel}>
            <span>Clear agent context between iterations</span>
            <span style={S.checkboxHint}>
              Sends <code>/clear</code> before each iteration so the agent starts fresh. Prevents context pollution from prior attempts at the cost of losing what was already tried. Best for independent attempts; turn off for iterative refinement.
            </span>
          </span>
        </label>
      </div>
    </details>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/AdvancedSection.tsx
git commit -m "feat(loop): extract AdvancedSection"
```

---

## Task 6: Recompose LoopConfigForm (idle form)

**Files:**
- Modify: `resources/plugins/manifold.loop/src/webview/components/LoopConfigForm.tsx`

Replace the whole component body. It keeps the same props, the `improveWithAi`, `update`, and `build` logic, and now composes Task group + `<ScoringFields>` + `<AdvancedSection>` with hairline-separated sections.

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useState } from 'react'
import type { LoopConfig } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { type FormState, configFromForm, formFromConfig } from '../helpers'
import { ScoringFields } from './ScoringFields'
import { AdvancedSection } from './AdvancedSection'

interface ConfigFormProps {
  sessionId: string
  initialConfig: LoopConfig | null
  disabled: boolean
  onStart: (config: LoopConfig) => void
  onSave: (config: LoopConfig) => void
  onImproveWithAi: (draft: string, evalCommand: string, targetGlobs: string) => Promise<string>
}

export function LoopConfigForm({ sessionId, initialConfig, disabled, onStart, onSave, onImproveWithAi }: ConfigFormProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(() => formFromConfig(initialConfig))
  const [error, setError] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)

  React.useEffect(() => { setForm(formFromConfig(initialConfig)) }, [initialConfig])

  async function improveWithAi(): Promise<void> {
    if (aiBusy) return
    setAiBusy(true)
    setError(null)
    try {
      const cleaned = (await onImproveWithAi(form.program.trim(), form.evalCommand, form.targetGlobs)).trim()
      if (!cleaned) { setError('AI returned no output — is a default runtime configured?'); return }
      update('program', cleaned)
    } catch (e) {
      setError(`AI improve failed: ${(e as Error).message}`)
    } finally {
      setAiBusy(false)
    }
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function build(): LoopConfig | null {
    const result = configFromForm(sessionId, form)
    if ('error' in result) { setError(result.error); return null }
    setError(null)
    return result
  }

  return (
    <form
      style={S.form}
      onSubmit={(e) => { e.preventDefault(); const cfg = build(); if (cfg) onStart(cfg) }}
    >
      <section style={S.group}>
        <div style={S.sectionHeader}>Task</div>
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>What should the agent do each iteration?</label>
            <button
              type="button"
              onClick={() => { void improveWithAi() }}
              disabled={disabled || aiBusy}
              style={{ ...S.aiButton, ...(disabled && !aiBusy ? S.aiButtonDisabled : null), ...(aiBusy ? S.aiButtonBusy : null) }}
              title="Use your default AI coding assistant to rewrite this task spec"
            >
              <span aria-hidden="true" style={{ ...S.aiSparkle, ...(aiBusy ? S.aiSparkleBusy : null) }}>✦</span>
              {aiBusy ? 'Improving…' : 'Improve with AI'}
            </button>
          </div>
          <textarea
            style={S.textareaProse}
            value={form.program}
            onChange={(e) => update('program', e.target.value)}
            disabled={disabled}
            placeholder="Describe what the agent should do each iteration. e.g. 'Make all tests in src/** pass without modifying test files.'"
          />
        </div>
        <div style={S.field}>
          <div style={S.labelRow}>
            <label style={S.label}>Files it may edit</label>
            <span style={S.labelHint}>leave blank to allow edits anywhere</span>
          </div>
          <input style={S.input} value={form.targetGlobs} onChange={(e) => update('targetGlobs', e.target.value)} disabled={disabled} placeholder="e.g. src/**, README.md" />
        </div>
      </section>

      <hr style={S.groupDivider} />

      <section style={S.group}>
        <div style={S.sectionHeader}>Scoring</div>
        <ScoringFields form={form} disabled={disabled} update={update} />
      </section>

      <hr style={S.groupDivider} />

      <AdvancedSection form={form} disabled={disabled} update={update} />

      {error && <div style={{ color: 'var(--status-error)', fontSize: 'var(--type-ui-small)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
        <button type="submit" style={S.primaryButton} disabled={disabled}>Start Loop</button>
        <button type="button" style={S.secondaryButton} onClick={() => { const cfg = build(); if (cfg) onSave(cfg) }} disabled={disabled}>Save</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors. Confirm `LoopConfigForm.tsx` is well under 300 LOC.

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/LoopConfigForm.tsx
git commit -m "feat(loop): recompose config form into Task/Scoring/Advanced sections"
```

---

## Task 7: LiveRunCard + liverun styles

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/styles/liverun.styles.ts`
- Create: `resources/plugins/manifold.loop/src/webview/components/LiveRunCard.tsx`
- Modify: `resources/plugins/manifold.loop/src/webview/styles/index.ts`

- [ ] **Step 1: Create the liverun styles**

```ts
// resources/plugins/manifold.loop/src/webview/styles/liverun.styles.ts
import type React from 'react'

export const liverunStyles: Record<string, React.CSSProperties> = {
  liveCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-sm)',
  },
  liveTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: 'var(--status-running)',
    animation: 'dot-blink 1.4s ease-in-out infinite',
    flexShrink: 0,
  },
  liveState: { fontWeight: 600 },
  liveTimer: {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  liveScores: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
  },
  liveTrack: {
    position: 'relative',
    height: 3,
    background: 'var(--bg-secondary)',
    borderRadius: 'var(--radius-xs)',
    overflow: 'hidden',
  },
  liveTrackFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '25%',
    background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
    animation: 'loop-progress-sweep 1.8s ease-in-out infinite',
  },
  liveMeta: {
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trendCard: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-sm) var(--space-md)',
  },
  trendHead: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-sm)',
  },
  trendBars: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 6,
    height: 60,
  },
  trendBar: {
    flex: 1,
    minWidth: 6,
    background: 'var(--status-done)',
    borderRadius: '3px 3px 0 0',
    opacity: 0.55,
  },
  trendBarBest: {
    background: 'var(--accent)',
    opacity: 1,
  },
  trendBarRegressed: {
    background: 'var(--status-waiting)',
  },
}
```

- [ ] **Step 2: Merge into the styles index**

Replace `resources/plugins/manifold.loop/src/webview/styles/index.ts`:

```ts
import type React from 'react'
import { panelStyles } from './panel.styles'
import { formStyles } from './form.styles'
import { iterationStyles, outcomeColors, stateColors } from './iteration.styles'
import { liverunStyles } from './liverun.styles'

export const loopPanelStyles: Record<string, React.CSSProperties> = { ...panelStyles, ...formStyles, ...iterationStyles, ...liverunStyles }
export { outcomeColors, stateColors }
```

- [ ] **Step 3: Create LiveRunCard**

```tsx
// resources/plugins/manifold.loop/src/webview/components/LiveRunCard.tsx
import React, { useEffect, useState } from 'react'
import type { LoopConfig, LoopStatus } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { describeMetric } from '../helpers'
import { formatElapsed } from '../run-view'

interface Props {
  status: LoopStatus
  config: LoopConfig
  iterationNumber: number
  onStop: () => void
}

export function LiveRunCard({ status, config, iterationNumber, onStop }: Props): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const maxIter = config.maxIterations ?? '∞'
  const elapsed = status.startedAt ? formatElapsed(now - status.startedAt) : null
  const targets = config.targetGlobs.length ? config.targetGlobs.join(', ') : 'anywhere'

  return (
    <div style={S.liveCard}>
      <div style={S.liveTop}>
        <span style={S.liveDot} aria-hidden="true" />
        <span style={S.liveState}>Running · iteration {iterationNumber} of {maxIter}</span>
        {elapsed && <span style={S.liveTimer}>⏱ {elapsed}</span>}
        <button style={S.secondaryButton} onClick={onStop}>Stop</button>
      </div>
      {status.bestScore !== undefined && (
        <div style={S.liveScores}>
          <span style={S.bestBadge}>best {status.bestScore}</span>
        </div>
      )}
      <div style={S.liveTrack} aria-hidden="true"><div style={S.liveTrackFill} /></div>
      <div style={S.liveMeta}>
        editing {targets} · eval {config.evalCommand || describeMetric(config.metric)} · {config.budgetSeconds}s budget
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/styles/liverun.styles.ts resources/plugins/manifold.loop/src/webview/styles/index.ts resources/plugins/manifold.loop/src/webview/components/LiveRunCard.tsx
git commit -m "feat(loop): LiveRunCard consolidating status bar + pending card"
```

---

## Task 8: ScoreTrend component

**Files:**
- Create: `resources/plugins/manifold.loop/src/webview/components/ScoreTrend.tsx`

- [ ] **Step 1: Write the component**

```tsx
// resources/plugins/manifold.loop/src/webview/components/ScoreTrend.tsx
import React from 'react'
import type { LoopIteration, MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { computeTrend } from '../run-view'

interface Props {
  iterations: LoopIteration[]
  metric: MetricSpec
  bestCommitSha: string | undefined
}

/** Compact bar trend of scores across iterations. Renders nothing until there are at
 *  least two scored iterations (handled by computeTrend returning []). */
export function ScoreTrend({ iterations, metric, bestCommitSha }: Props): React.JSX.Element | null {
  const bars = computeTrend(iterations, metric, bestCommitSha)
  if (bars.length < 2) return null
  const scores = bars.map((b) => b.score)
  return (
    <div style={S.trendCard}>
      <div style={S.trendHead}>
        <span>Score over time</span>
        <span>{Math.min(...scores)} → {Math.max(...scores)}</span>
      </div>
      <div style={S.trendBars}>
        {bars.map((b) => (
          <div
            key={b.index}
            title={`#${b.index}: ${b.score}`}
            style={{
              ...S.trendBar,
              ...(b.outcome === 'regressed' ? S.trendBarRegressed : null),
              ...(b.isBest ? S.trendBarBest : null),
              height: `${Math.round(b.heightPct * 100)}%`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck:plugins`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/ScoreTrend.tsx
git commit -m "feat(loop): ScoreTrend bar strip"
```

---

## Task 9: Restyle IterationList (outcome border + best highlight)

**Files:**
- Modify: `resources/plugins/manifold.loop/src/webview/styles/iteration.styles.ts`
- Modify: `resources/plugins/manifold.loop/src/webview/components/LoopIterationList.tsx`

- [ ] **Step 1: Add styles** to `iterationStyles` in `iteration.styles.ts`:

```ts
  iterRowBest: {
    background: 'var(--accent-subtle)',
    borderColor: 'var(--accent-dim)',
  },
  iterStar: {
    color: 'var(--accent)',
    fontSize: 'var(--type-ui-small)',
    flexShrink: 0,
  },
```

And add a `borderLeft` to the existing `iterRow` key (merge into its object):

```ts
  iterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '6px 8px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--text-muted)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui-small)',
  },
```

Add an outcome→border-color map export at the bottom of the file:

```ts
export const outcomeBorder: Record<string, string> = {
  improved: 'var(--status-done)',
  regressed: 'var(--status-waiting)',
  failed: 'var(--status-error)',
  aborted: 'var(--text-muted)',
}
```

- [ ] **Step 2: Update the styles index export** — add `outcomeBorder` to the re-export in `styles/index.ts`:

```ts
import { iterationStyles, outcomeColors, stateColors, outcomeBorder } from './iteration.styles'
// ...
export { outcomeColors, stateColors, outcomeBorder }
```

- [ ] **Step 3: Update LoopIterationList** to accept `bestIndex` and apply the border/best styles. Replace the file:

```tsx
import React, { useMemo, useState } from 'react'
import type { LoopIteration } from '../../types'
import { loopPanelStyles as S, outcomeColors, outcomeBorder } from '../styles'

export function IterationList({ iterations, bestIndex }: { iterations: LoopIteration[]; bestIndex: number | null }): React.JSX.Element {
  const sorted = useMemo(
    () => [...iterations].sort((a, b) => {
      const aTime = a.finishedAt ?? a.startedAt
      const bTime = b.finishedAt ?? b.startedAt
      if (bTime !== aTime) return bTime - aTime
      return b.index - a.index
    }),
    [iterations],
  )
  const [expanded, setExpanded] = useState<number | null>(null)
  return (
    <div style={S.iterList}>
      {sorted.map((iter) => {
        const colors = outcomeColors[iter.outcome] ?? outcomeColors.failed
        const canExpand = Boolean(iter.judgeOutputTail?.trim())
        const isOpen = expanded === iter.index
        const isBest = bestIndex !== null && iter.index === bestIndex
        return (
          <div key={iter.index} style={S.iterGroup}>
            <div
              style={{
                ...S.iterRow,
                borderLeft: `3px solid ${outcomeBorder[iter.outcome] ?? 'var(--text-muted)'}`,
                ...(isBest ? S.iterRowBest : null),
                ...(canExpand ? S.iterRowClickable : null),
              }}
              onClick={canExpand ? () => setExpanded(isOpen ? null : iter.index) : undefined}
              role={canExpand ? 'button' : undefined}
              tabIndex={canExpand ? 0 : undefined}
            >
              <div style={S.iterIndex}>#{iter.index}</div>
              {isBest && <span style={S.iterStar} title="Best so far">★</span>}
              <span style={{ ...S.iterOutcome, background: colors.bg, color: colors.fg }}>{iter.outcome}</span>
              {iter.score !== undefined && (
                <span style={S.iterScore}>
                  <span style={S.iterScoreLabel}>score</span>
                  <span style={S.iterScoreValue}>{iter.score}</span>
                </span>
              )}
              <span style={S.iterReason}>{iter.errorMessage ?? (iter.commitSha ? iter.commitSha.slice(0, 7) : '')}</span>
              {canExpand && <span style={S.iterToggle}>{isOpen ? '▾' : '▸'} judge</span>}
            </div>
            {canExpand && isOpen && (
              <pre style={S.iterJudgeOutput}>{iter.judgeOutputTail}</pre>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:plugins`
Expected: FAIL at `LoopPanel.tsx` (still calls `<IterationList>` without `bestIndex`). That is fixed in Task 10 — proceed.

- [ ] **Step 5: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/styles/iteration.styles.ts resources/plugins/manifold.loop/src/webview/styles/index.ts resources/plugins/manifold.loop/src/webview/components/LoopIterationList.tsx
git commit -m "feat(loop): outcome-colored borders and best-iteration highlight"
```

---

## Task 10: Rewire LoopPanel (idle vs running router)

**Files:**
- Modify: `resources/plugins/manifold.loop/src/webview/components/LoopPanel.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useEffect, useState } from 'react'
import { loopPanelStyles as S, stateColors } from '../styles'
import { bestIterationIndex } from '../run-view'
import { LoopConfigForm } from './LoopConfigForm'
import { IterationList } from './LoopIterationList'
import { LiveRunCard } from './LiveRunCard'
import { ScoreTrend } from './ScoreTrend'
import { useLoopBridge } from '../use-loop-bridge'

export function LoopPanel(): React.JSX.Element {
  const loop = useLoopBridge()
  const sessionId = loop.sessionId
  const [restoreMsg, setRestoreMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!restoreMsg) return
    const t = window.setTimeout(() => setRestoreMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [restoreMsg])

  if (!sessionId) {
    return (
      <div style={S.wrapper}>
        <div style={S.empty}>
          <div style={S.emptyGlyph} aria-hidden="true">↻</div>
          <div>Select a session to configure an autoresearch loop.</div>
          <div style={{ color: 'var(--text-muted)' }}>
            The loop repeatedly asks the agent to edit files, then runs an eval command to decide whether each attempt is an improvement.
          </div>
        </div>
      </div>
    )
  }

  const isRunning = loop.status?.state === 'running'
  const hasImprovement = !!loop.status?.bestCommitSha && loop.status.bestCommitSha !== loop.status.baselineSha
  const canClear = !isRunning && (loop.iterations.length > 0 || loop.status !== null)
  const bestIndex = bestIterationIndex(loop.iterations, loop.status?.bestCommitSha)

  const handleRestoreBest = async (): Promise<void> => {
    setRestoring(true)
    try {
      const { sha } = await loop.restoreBest()
      setRestoreMsg({ kind: 'ok', text: `Restored to ${sha.slice(0, 7)}` })
    } catch (err) {
      setRestoreMsg({ kind: 'err', text: `Restore failed: ${(err as Error).message}` })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div style={S.wrapper}>
      <div style={S.header}>
        <div style={S.title}>Autoresearch Loop</div>
        <div style={S.headerActions}>
          {restoreMsg && (
            <span style={{ fontSize: 'var(--type-ui-caption)', color: restoreMsg.kind === 'ok' ? 'var(--status-done)' : 'var(--status-error)' }}>
              {restoreMsg.text}
            </span>
          )}
          {!isRunning && hasImprovement && (
            <button style={S.secondaryButton} disabled={restoring} onClick={() => void handleRestoreBest()}>
              {restoring ? 'Restoring…' : 'Restore Best'}
            </button>
          )}
          {canClear && <button style={S.secondaryButton} onClick={() => loop.clear()}>Clear</button>}
        </div>
      </div>

      <div style={S.content}>
        {loop.startError && <div style={S.startError} role="alert">{loop.startError}</div>}

        {isRunning && loop.config && loop.status ? (
          <LiveRunCard
            status={loop.status}
            config={loop.config}
            iterationNumber={loop.iterations.length + 1}
            onStop={() => loop.stop()}
          />
        ) : (
          <>
            <LoopIntro />
            <LoopConfigForm
              sessionId={sessionId}
              initialConfig={loop.config}
              disabled={false}
              onStart={(cfg) => loop.start(cfg)}
              onSave={(cfg) => loop.saveConfig(cfg)}
              onImproveWithAi={loop.improveWithAi}
            />
          </>
        )}

        {loop.config && (
          <ScoreTrend iterations={loop.iterations} metric={loop.config.metric} bestCommitSha={loop.status?.bestCommitSha} />
        )}

        {loop.iterations.length > 0 && <IterationList iterations={loop.iterations} bestIndex={bestIndex} />}
      </div>
    </div>
  )
}

function LoopIntro(): React.JSX.Element {
  return (
    <details style={S.disclosure}>
      <summary style={S.disclosureSummary}>What is this?</summary>
      <div style={{ ...S.disclosureBody, padding: '0 var(--space-sm) var(--space-sm)' }}>
        <div>
          The loop repeatedly asks the agent to edit your target files, then runs your eval command to score the result. Improvements are committed; regressions are discarded via <code>git reset --hard</code>. Git is the undo buffer.
        </div>
        <div style={S.introSection}>
          <span style={S.introTag}>Good for</span>
          <span>tasks with an automatable scalar metric — test pass/fail, benchmark timing, bundle size, lint error count. Anywhere you&apos;d otherwise guess-and-check.</span>
        </div>
        <div style={S.introSection}>
          <span style={S.introTagMuted}>Avoid for</span>
          <span>open-ended design work, subjective quality (&ldquo;make the UI nicer&rdquo;), or one-shot changes you already know how to make. If you can&apos;t write an eval command that decides &ldquo;better,&rdquo; don&apos;t loop.</span>
        </div>
      </div>
    </details>
  )
}
```

Note: the running-state `status` chip (state dot + iter count + best badge + shimmer) is now fully represented by `LiveRunCard`, so the old `statusBar`/`PendingIterationCard` blocks are intentionally removed. `stateColors` import is retained only if still used; if `npm run typecheck:plugins` flags it as unused, drop it from the import.

- [ ] **Step 2: Add the empty-state glyph style** to `panel.styles.ts` `panelStyles`:

```ts
  emptyGlyph: {
    fontSize: 28,
    color: 'var(--text-muted)',
    opacity: 0.5,
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:plugins`
Expected: PASS (no new errors). If `stateColors` is reported unused, remove it from the `LoopPanel.tsx` import and re-run.

- [ ] **Step 4: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/components/LoopPanel.tsx resources/plugins/manifold.loop/src/webview/styles/panel.styles.ts
git commit -m "feat(loop): LoopPanel routes idle vs running; renders trend + best history"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full plugin webview test suite**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/`
Expected: PASS — including `run-view.test.ts`, `SegmentedControl.test.tsx`, plus the pre-existing `helpers.test.ts` and `loop-state.test.ts`.

- [ ] **Step 2: Typecheck the plugin + the web/node projects**

Run: `npm run typecheck:plugins && npm run typecheck:web && npm run typecheck:node`
Expected: `typecheck:plugins` clean; `typecheck:web`/`typecheck:node` at or below the documented baseline (web 53 / node 21) — no NEW errors attributable to this change.

- [ ] **Step 3: Build the plugin bundle**

Run: `npm run build:plugins`
Expected: builds `loop` (and the other plugins) with no errors; `resources/plugins/manifold.loop/out/plugin.js` is regenerated.

- [ ] **Step 4: Manual app check**

Launch Manifold (per the `run` skill / project launch flow), open the Autoresearch Loop panel, and confirm:
- Idle form shows sentence-case labels, Task/Scoring/Advanced sections, and the segmented metric control.
- Switching metric reveals the right dependent fields (max score + rubric for LLM judge; regex; JSON path; direction for regex/json-path).
- Improve with AI rewrites the program; busy/disabled states intact.
- Save persists; reopening the panel restores the config.
- Start → the form is replaced by the LiveRunCard with a ticking elapsed timer and Stop.
- After ≥2 scored iterations, the ScoreTrend strip appears; the best iteration row is gold-tinted with ★.
- Stop / Restore Best / Clear all work; the restore toast appears.
- Empty state renders when no session is selected.

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore(loop): verification cleanup" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** visual language (Tasks 3,6), config form B (Tasks 4,5,6), segmented metric (Tasks 2,4), live-run card (Task 7), trend strip auto-hidden <2 (Tasks 1,8), history outcome borders + best highlight (Tasks 1,9), empty state + intro + header actions + errors (Task 10), file split + token-only (all tasks), verification (Task 11). All spec sections map to a task.
- **No protocol/engine/host edits** — confirmed: only `webview/` files are created/modified.
- **Type consistency:** `update<K>` signature is identical across ScoringFields/AdvancedSection/LoopConfigForm; `bestIterationIndex`/`computeTrend`/`formatElapsed` signatures match their call sites; `IterationList` gains a required `bestIndex` prop set in Task 10.
- **300-LOC ceiling:** the largest rewritten file (`LoopConfigForm.tsx`) is ~110 LOC; styles split via `liverun.styles.ts`.
