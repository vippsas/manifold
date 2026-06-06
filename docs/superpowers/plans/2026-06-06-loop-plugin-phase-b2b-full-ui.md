# Loop-as-a-Plugin — Phase B2b: Full Webview UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the full interactive loop UI (config form, iteration history, controls, Improve-with-AI, Clear-confirm) into the `manifold.loop` webview, reaching parity with the built-in panel.

**Architecture:** A webview state bridge (`use-loop-bridge`) replaces `useLoop` over postMessage; the three React components are ported with their renderer-only deps swapped for the bridge + host-routed callbacks; the 469-line styles object is split <300 LOC; the plugin's `webview-host` handles the full message set via the engine + two injected (manifold-backed) callbacks.

**Tech Stack:** TypeScript, React 18, esbuild (browser/iife), Vitest. Spec: `docs/superpowers/specs/2026-06-06-loop-plugin-phase-b2b-full-ui-design.md`. Source components: `src/renderer/components/loop/`.

---

## Conventions (read once)

- Tests: `npx vitest run <path>`. Gates: `typecheck:node` (16), `typecheck:web` (36), `typecheck:plugins` (clean). No new errors in touched files.
- `out/` gitignored; commit `src/` + manifest only. Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- If `.gitignore` shows an uncommitted `docs/superpowers/` line, run `git restore --source=HEAD .gitignore` before committing (a stray hook re-adds it).
- Webview testable modules (`helpers`, `improve-instruction`, `loop-state` reducer, `webview-host`) must NOT import `manifold` or `react-dom` so they run under vitest. The components + `index.tsx` + the hook may import React; they're verified by build + manual smoke.

## File Structure (all under `resources/plugins/manifold.loop/src/` unless noted)

- `webview/protocol.ts` — add `restoreResult`.
- `webview/styles/panel.styles.ts`, `form.styles.ts`, `iteration.styles.ts`, `index.ts` — split styles.
- `webview/helpers.ts` (+ `helpers.test.ts`) — form↔config + describeMetric.
- `webview/loop-state.ts` (+ `loop-state.test.ts`) — `applyHostMsg` reducer + `UiLoopState`.
- `webview/use-loop-bridge.ts` — the hook (React).
- `webview/components/LoopIterationList.tsx`, `LoopConfigForm.tsx`, `LoopPanel.tsx` — ported UI.
- `webview/keyframes.ts` — keyframes CSS string.
- `webview/index.tsx` — render `<LoopPanel/>` + inject keyframes.
- `improve-instruction.ts` (+ `improve-instruction.test.ts`) — pure prompt builder.
- `webview-host.ts` (+ `webview-host.test.ts`) — widened engine facade + full dispatch + `refresh`.
- `plugin.ts` — wire `confirmClear`/`improveWithAi`/session refresh.

---

## Task 1: Protocol — add `restoreResult`

**Files:** Modify `resources/plugins/manifold.loop/src/webview/protocol.ts`

- [ ] **Step 1: Add the variant**

In `HostMsg`, add after the `iteration` line:

```ts
  | { type: 'restoreResult'; ok: boolean; sha?: string; error?: string }
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck:plugins` → exit 0.

```bash
git add resources/plugins/manifold.loop/src/webview/protocol.ts
git commit -m "feat(loop-plugin): add restoreResult to webview protocol

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Split the styles (<300 LOC each)

**Files:** Create `webview/styles/{panel,form,iteration}.styles.ts` + `webview/styles/index.ts`

Source: `src/renderer/components/loop/LoopPanel.styles.ts` (a single `loopPanelStyles` object + `outcomeColors` + `stateColors`). Split its keys verbatim across three files; merge in an index.

- [ ] **Step 1: panel styles**

Create `webview/styles/panel.styles.ts`:
```ts
import type React from 'react'
export const panelStyles: Record<string, React.CSSProperties> = {
  // COPY these keys verbatim from LoopPanel.styles.ts:
  // wrapper, header, title, headerActions, content, empty,
  // statusBar, statusBarRunning, statusBarShimmer, statusBarShimmerFill, stateDot, bestBadge,
  // intro, introTitle, introSection, introTag, introTagMuted,
  // pendingCard, pendingHeader, pendingPulse, pendingMeta, pendingMetaLabel, pendingMetaValue,
  // pendingHint, pendingProgressTrack, pendingProgressBar,
  // disclosure, disclosureSummary, disclosureBody
}
```
Paste the exact property objects for those keys from `LoopPanel.styles.ts`.

- [ ] **Step 2: form styles**

Create `webview/styles/form.styles.ts`:
```ts
import type React from 'react'
export const formStyles: Record<string, React.CSSProperties> = {
  // COPY verbatim: form, field, label, input, textarea, labelRow, labelHint, labelActions,
  // aiButton, aiButtonDisabled, aiButtonBusy, aiSparkle, aiSparkleBusy,
  // inputRow, checkboxRow, checkbox, checkboxLabel, checkboxHint, select,
  // primaryButton, secondaryButton
}
```

- [ ] **Step 3: iteration styles + color maps**

Create `webview/styles/iteration.styles.ts`:
```ts
import type React from 'react'
export const iterationStyles: Record<string, React.CSSProperties> = {
  // COPY verbatim: iterList, iterRow, iterIndex, iterOutcome, iterScore, iterScoreLabel,
  // iterScoreValue, iterReason, iterGroup, iterRowClickable, iterToggle, iterJudgeOutput
}
export const outcomeColors: Record<string, { bg: string; fg: string }> = {
  // COPY verbatim from LoopPanel.styles.ts
}
export const stateColors: Record<string, string> = {
  // COPY verbatim from LoopPanel.styles.ts
}
```

- [ ] **Step 4: index merge**

Create `webview/styles/index.ts`:
```ts
import type React from 'react'
import { panelStyles } from './panel.styles'
import { formStyles } from './form.styles'
import { iterationStyles, outcomeColors, stateColors } from './iteration.styles'

export const loopPanelStyles: Record<string, React.CSSProperties> = { ...panelStyles, ...formStyles, ...iterationStyles }
export { outcomeColors, stateColors }
```

- [ ] **Step 5: Verify nothing references a missing key**

Run: `grep -oE "S\.[a-zA-Z]+" src/renderer/components/loop/LoopPanel.tsx src/renderer/components/loop/LoopConfigForm.tsx src/renderer/components/loop/LoopIterationList.tsx | sort -u`
Confirm every referenced key exists in one of the three split files (every key in the original object is preserved across the split — no key dropped or renamed).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck:plugins` → exit 0.
Run: `wc -l resources/plugins/manifold.loop/src/webview/styles/*.ts` → each < 300.

```bash
git add resources/plugins/manifold.loop/src/webview/styles
git commit -m "feat(loop-plugin): port loop styles (split <300 LOC)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Port form helpers

**Files:** Create `webview/helpers.ts` + `webview/helpers.test.ts`

- [ ] **Step 1: Copy the helpers**

Copy `src/renderer/components/loop/LoopPanel.helpers.ts` to `resources/plugins/manifold.loop/src/webview/helpers.ts`, changing only the import:
```ts
import type { LoopConfig, MetricSpec } from '../types'
```
(Everything else verbatim: `FormState`, `DEFAULT_FORM`, `formFromConfig`, `configFromForm`, `describeMetric`.)

- [ ] **Step 2: Write the test**

Create `webview/helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { configFromForm, formFromConfig, describeMetric, DEFAULT_FORM } from './helpers'
import type { LoopConfig } from '../types'

describe('configFromForm', () => {
  it('rejects an empty program', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: '  ', metricKind: 'exit-code', evalCommand: 'x' })
    expect('error' in r && r.error).toMatch(/program/i)
  })
  it('builds an llm-judge config without an eval command', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: 'do it', metricKind: 'llm-judge', evalCommand: '', judgeRubric: 'r', judgeMaxScore: '10' })
    expect('error' in r).toBe(false)
    if (!('error' in r)) { expect(r.metric.kind).toBe('llm-judge'); expect(r.sessionId).toBe('s1') }
  })
  it('requires eval command for non-judge metrics', () => {
    const r = configFromForm('s1', { ...DEFAULT_FORM, program: 'p', metricKind: 'exit-code', evalCommand: '' })
    expect('error' in r && r.error).toMatch(/evalCommand/i)
  })
})

describe('formFromConfig round-trips', () => {
  it('preserves a stdout-regex config', () => {
    const cfg: LoopConfig = { sessionId: 's1', program: 'p', targetGlobs: ['src/**'], evalCommand: 'npm t', metric: { kind: 'stdout-regex', pattern: 'ms=(\\d+)', direction: 'minimize' }, budgetSeconds: 30, maxIterations: 5 }
    const back = configFromForm('s1', formFromConfig(cfg))
    expect('error' in back).toBe(false)
    if (!('error' in back)) expect(back.metric).toEqual(cfg.metric)
  })
})

describe('describeMetric', () => {
  it('describes each kind', () => {
    expect(describeMetric({ kind: 'exit-code', direction: 'minimize' })).toMatch(/exit/i)
    expect(describeMetric({ kind: 'llm-judge', rubric: 'r', maxScore: 10, direction: 'maximize' })).toMatch(/judge/i)
  })
})
```

- [ ] **Step 3: Run + commit**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/helpers.test.ts` → PASS.

```bash
git add resources/plugins/manifold.loop/src/webview/helpers.ts resources/plugins/manifold.loop/src/webview/helpers.test.ts
git commit -m "feat(loop-plugin): port loop form helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Improve-with-AI instruction builder (pure)

**Files:** Create `improve-instruction.ts` + `improve-instruction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `resources/plugins/manifold.loop/src/improve-instruction.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildImproveInstruction } from './improve-instruction'

describe('buildImproveInstruction', () => {
  it('rewrites an existing draft and forbids questions/fences', () => {
    const s = buildImproveInstruction({ draft: 'make it fast', evalCommand: 'npm bench', targetGlobs: 'src/**' })
    expect(s).toContain('make it fast')
    expect(s).toMatch(/Do NOT ask clarifying questions/i)
    expect(s).toMatch(/no code fences/i)
  })
  it('writes a starter spec from eval/globs when no draft', () => {
    const s = buildImproveInstruction({ draft: '', evalCommand: 'npm bench', targetGlobs: 'src/**' })
    expect(s).toContain('npm bench')
    expect(s).toContain('src/**')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/improve-instruction.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement (ported verbatim from `LoopConfigForm.improveWithAi`)**

Create `resources/plugins/manifold.loop/src/improve-instruction.ts`:
```ts
// resources/plugins/manifold.loop/src/improve-instruction.ts
// Pure prompt builder for "Improve with AI", ported from the loop config form. No manifold import.
export interface ImproveArgs { draft: string; evalCommand: string; targetGlobs: string }

export function buildImproveInstruction({ draft, evalCommand, targetGlobs }: ImproveArgs): string {
  const trimmed = draft.trim()
  return trimmed
    ? `You are rewriting a task description for an autoresearch loop. The loop repeatedly asks a coding agent to edit files in this repo to improve a measurable metric. Rewrite the user's draft into a clear, concrete task spec: state the goal, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.\n\nUser's draft:\n${trimmed}`
    : `You are writing a starter task description for an autoresearch loop that runs in this repo. The loop repeatedly asks a coding agent to edit files to improve a measurable metric (eval command: "${evalCommand}", target globs: ${targetGlobs}). Write a clear, concrete task spec: state a plausible goal based on the repo, list constraints (what not to touch), and define what "better" means. Do NOT ask clarifying questions — make reasonable assumptions and commit to them. Keep it short. Return ONLY the task spec as plain text — no preamble, no code fences, no questions.`
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run resources/plugins/manifold.loop/src/improve-instruction.test.ts` → PASS.

```bash
git add resources/plugins/manifold.loop/src/improve-instruction.ts resources/plugins/manifold.loop/src/improve-instruction.test.ts
git commit -m "feat(loop-plugin): improve-with-AI instruction builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: State reducer

**Files:** Create `webview/loop-state.ts` + `webview/loop-state.test.ts`

- [ ] **Step 1: Write the failing test**

Create `webview/loop-state.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { applyHostMsg, EMPTY_LOOP_STATE } from './loop-state'

describe('applyHostMsg', () => {
  it('init replaces everything', () => {
    const s = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: { sessionId: 's1', state: 'idle', currentIteration: 0 }, iterations: [{ index: 1, startedAt: 0, outcome: 'improved' }], config: null })
    expect(s.sessionId).toBe('s1')
    expect(s.iterations.length).toBe(1)
  })
  it('status updates only status', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    const s = applyHostMsg(base, { type: 'status', status: { sessionId: 's1', state: 'running', currentIteration: 2 } })
    expect(s.status?.state).toBe('running')
    expect(s.sessionId).toBe('s1')
  })
  it('iteration appends', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    const s = applyHostMsg(base, { type: 'iteration', iteration: { index: 1, startedAt: 0, outcome: 'failed' } })
    expect(s.iterations.length).toBe(1)
  })
  it('ignores aiResult/restoreResult/actionError (handled outside the reducer)', () => {
    const base = applyHostMsg(EMPTY_LOOP_STATE, { type: 'init', sessionId: 's1', status: null, iterations: [], config: null })
    expect(applyHostMsg(base, { type: 'aiResult', ok: true, text: 'x' })).toBe(base)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/loop-state.test.ts` → FAIL.

- [ ] **Step 3: Implement**

Create `webview/loop-state.ts`:
```ts
// resources/plugins/manifold.loop/src/webview/loop-state.ts
import type { LoopConfig, LoopIteration, LoopStatus } from '../types'
import type { HostMsg } from './protocol'

export interface UiLoopState {
  sessionId: string | null
  status: LoopStatus | null
  iterations: LoopIteration[]
  config: LoopConfig | null
}

export const EMPTY_LOOP_STATE: UiLoopState = { sessionId: null, status: null, iterations: [], config: null }

/** Pure reducer for host→webview state messages. Result-only messages (aiResult,
 *  restoreResult, actionError) are handled by the bridge's promise plumbing, not here. */
export function applyHostMsg(state: UiLoopState, msg: HostMsg): UiLoopState {
  switch (msg.type) {
    case 'init':
      return { sessionId: msg.sessionId, status: msg.status, iterations: msg.iterations, config: msg.config }
    case 'status':
      return { ...state, status: msg.status }
    case 'iteration':
      return { ...state, iterations: [...state.iterations, msg.iteration] }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview/loop-state.test.ts` → PASS.

```bash
git add resources/plugins/manifold.loop/src/webview/loop-state.ts resources/plugins/manifold.loop/src/webview/loop-state.test.ts
git commit -m "feat(loop-plugin): webview loop-state reducer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Bridge hook

**Files:** Create `webview/use-loop-bridge.ts`

- [ ] **Step 1: Implement the hook**

Create `resources/plugins/manifold.loop/src/webview/use-loop-bridge.ts`:
```ts
// resources/plugins/manifold.loop/src/webview/use-loop-bridge.ts
// Webview-side replacement for the renderer useLoop hook: state from host messages,
// actions via parent.postMessage. restoreBest/improveWithAi are single-flight (UI disables
// the trigger while busy) so one pending resolver per kind suffices.
import { useEffect, useRef, useState } from 'react'
import type { LoopConfig } from '../types'
import type { HostMsg, WebviewMsg } from './protocol'
import { applyHostMsg, EMPTY_LOOP_STATE, type UiLoopState } from './loop-state'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

export interface LoopBridge extends UiLoopState {
  start: (config: LoopConfig) => void
  stop: () => void
  saveConfig: (config: LoopConfig) => void
  clear: () => void
  restoreBest: () => Promise<{ sha: string }>
  improveWithAi: (draft: string, evalCommand: string, targetGlobs: string) => Promise<string>
}

function postToHost(msg: WebviewMsg): void { parent.postMessage(msg, '*') }

export function useLoopBridge(): LoopBridge {
  const [state, setState] = useState<UiLoopState>(EMPTY_LOOP_STATE)
  const restoreResolver = useRef<{ resolve: (v: { sha: string }) => void; reject: (e: Error) => void } | null>(null)
  const aiResolver = useRef<{ resolve: (v: string) => void; reject: (e: Error) => void } | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'restoreResult') {
        if (m.ok && m.sha) restoreResolver.current?.resolve({ sha: m.sha })
        else restoreResolver.current?.reject(new Error(m.error ?? 'restore failed'))
        restoreResolver.current = null
        return
      }
      if (m.type === 'aiResult') {
        if (m.ok && m.text !== undefined) aiResolver.current?.resolve(m.text)
        else aiResolver.current?.reject(new Error(m.error ?? 'AI failed'))
        aiResolver.current = null
        return
      }
      if (m.type === 'actionError') { restoreResolver.current?.reject(new Error(m.message)); restoreResolver.current = null; return }
      setState((s) => applyHostMsg(s, m))
    }
    window.addEventListener('message', onMessage)
    postToHost({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return {
    ...state,
    start: (config) => { setState((s) => ({ ...s, status: { sessionId: config.sessionId, state: 'running', currentIteration: 0 }, iterations: [], config })); postToHost({ type: 'start', config }) },
    stop: () => postToHost({ type: 'stop' }),
    saveConfig: (config) => { setState((s) => ({ ...s, config })); postToHost({ type: 'saveConfig', config }) },
    clear: () => postToHost({ type: 'clearRequest' }),
    restoreBest: () => new Promise<{ sha: string }>((resolve, reject) => { restoreResolver.current = { resolve, reject }; postToHost({ type: 'restoreBest' }) }),
    improveWithAi: (draft, evalCommand, targetGlobs) => new Promise<string>((resolve, reject) => { aiResolver.current = { resolve, reject }; postToHost({ type: 'improveWithAi', draft, evalCommand, targetGlobs }) }),
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run typecheck:plugins` → exit 0.

```bash
git add resources/plugins/manifold.loop/src/webview/use-loop-bridge.ts
git commit -m "feat(loop-plugin): webview useLoopBridge (state + actions over postMessage)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Port the components

**Files:** Create `webview/components/{LoopIterationList,LoopConfigForm,LoopPanel}.tsx`, `webview/keyframes.ts`

- [ ] **Step 1: Iteration list (verbatim copy + import retarget)**

Copy `src/renderer/components/loop/LoopIterationList.tsx` to
`resources/plugins/manifold.loop/src/webview/components/LoopIterationList.tsx`, changing only its imports:
```ts
import type { LoopIteration } from '../../types'
import { loopPanelStyles as S, outcomeColors } from '../styles'
```
(Component body unchanged.)

- [ ] **Step 2: Config form (copy + swap the AI call to a prop)**

Copy `src/renderer/components/loop/LoopConfigForm.tsx` to
`resources/plugins/manifold.loop/src/webview/components/LoopConfigForm.tsx`. Changes:

Imports:
```ts
import React, { useState } from 'react'
import type { LoopConfig, MetricSpec } from '../../types'
import { loopPanelStyles as S } from '../styles'
import { type FormState, configFromForm, formFromConfig } from '../helpers'
```
Add an `onImproveWithAi` prop to `ConfigFormProps`:
```ts
interface ConfigFormProps {
  sessionId: string
  initialConfig: LoopConfig | null
  disabled: boolean
  onStart: (config: LoopConfig) => void
  onSave: (config: LoopConfig) => void
  onImproveWithAi: (draft: string) => Promise<string>
}
```
Destructure `onImproveWithAi` in the signature. Replace the body of `improveWithAi()` (the
`window.electronAPI.invoke('git:ai-generate', …)` block) with:
```ts
  async function improveWithAi(): Promise<void> {
    if (aiBusy) return
    setAiBusy(true)
    setError(null)
    try {
      const cleaned = (await onImproveWithAi(form.program.trim())).trim()
      if (!cleaned) { setError('AI returned no output — is a default runtime configured?'); return }
      update('program', cleaned)
    } catch (e) {
      setError(`AI improve failed: ${(e as Error).message}`)
    } finally {
      setAiBusy(false)
    }
  }
```
(Everything else — the JSX, fields, advanced section — unchanged.)

- [ ] **Step 3: Panel container (copy + swap hooks)**

Copy `src/renderer/components/loop/LoopPanel.tsx` to
`resources/plugins/manifold.loop/src/webview/components/LoopPanel.tsx`. Changes:

Imports:
```ts
import React, { useEffect, useState } from 'react'
import type { LoopConfig } from '../../types'
import { loopPanelStyles as S, stateColors } from '../styles'
import { describeMetric } from '../helpers'
import { LoopConfigForm } from './LoopConfigForm'
import { IterationList } from './LoopIterationList'
import { useLoopBridge } from '../use-loop-bridge'
```
Replace the first two lines of the component body:
```ts
  const loop = useLoopBridge()
  const sessionId = loop.sessionId
```
(remove the `useDockState`/`dock` lines).

Wire the config form's new prop where `<LoopConfigForm … />` is rendered, add:
```tsx
          onImproveWithAi={(draft) => loop.improveWithAi(draft, loop.config?.evalCommand ?? '', (loop.config?.targetGlobs ?? []).join(', '))}
```
Replace `handleClear` to drop `window.confirm` (the host confirms now):
```ts
  const handleClear = (): void => { loop.clear() }
```
(The rest — status bar, restore-best handler, pending card, intro, iteration list — unchanged.
`loop.saveConfig` replaces `loop.saveConfig`, `loop.start`/`loop.stop`/`loop.restoreBest` map 1:1.)

- [ ] **Step 4: Keyframes**

Create `resources/plugins/manifold.loop/src/webview/keyframes.ts`:
```ts
// resources/plugins/manifold.loop/src/webview/keyframes.ts
// @keyframes used by the loop styles, copied from src/renderer/styles/theme.css (the renderer's
// global stylesheet is not present in the sandboxed webview).
export const LOOP_KEYFRAMES = `
@keyframes dot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ai-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--accent-subtle); } 50% { box-shadow: 0 0 0 4px var(--accent-subtle); } }
@keyframes loop-progress-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
`
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck:plugins` → exit 0. Fix any import/type mismatches surfaced.

```bash
git add resources/plugins/manifold.loop/src/webview/components resources/plugins/manifold.loop/src/webview/keyframes.ts
git commit -m "feat(loop-plugin): port loop UI components to the webview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Entry — render the full panel

**Files:** Modify `resources/plugins/manifold.loop/src/webview/index.tsx`

- [ ] **Step 1: Replace the minimal app with the full panel + keyframes**

Overwrite `resources/plugins/manifold.loop/src/webview/index.tsx`:
```tsx
// resources/plugins/manifold.loop/src/webview/index.tsx
// Loop webview entry: injects keyframes (the renderer's global CSS is absent here) and mounts
// the ported LoopPanel. State + actions flow through use-loop-bridge (postMessage).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LoopPanel } from './components/LoopPanel'
import { LOOP_KEYFRAMES } from './keyframes'

const style = document.createElement('style')
style.textContent = LOOP_KEYFRAMES
document.head.appendChild(style)

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<LoopPanel />)
```

- [ ] **Step 2: Build**

Run: `npm run build:plugins` → `manifold.loop` builds; `out/webview.js` present.
Run: `test -f resources/plugins/manifold.loop/out/webview.js && echo OK` → `OK`.

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/webview/index.tsx
git commit -m "feat(loop-plugin): mount full LoopPanel in the webview entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Webview host — full dispatch

**Files:** Modify `webview-host.ts`, `webview-host.test.ts`

- [ ] **Step 1: Extend the test**

Add to `resources/plugins/manifold.loop/src/webview-host.test.ts` a richer engine fake + cases.
Replace the `engine` const with a recording fake and add tests:
```ts
function recordingEngine() {
  const calls: string[] = []
  return {
    calls,
    getStatus: async () => ({ sessionId: 's1', state: 'running', currentIteration: 2 }),
    getStatusSync: () => ({ sessionId: 's1', state: 'running', currentIteration: 0 }),
    getIterations: async () => [{ index: 1, startedAt: 0, outcome: 'improved' }],
    getConfig: async () => null,
    start: async (c: unknown) => { calls.push('start') },
    stop: async () => { calls.push('stop') },
    setConfig: async () => { calls.push('setConfig'); return {} },
    restoreBest: async () => ({ sha: 'abcdef0' }),
    clear: async () => { calls.push('clear'); return {} },
  }
}

describe('createWebviewHost — actions', () => {
  const baseOpts = () => ({ readBundle: () => '', getActiveSessionId: () => 's1', confirmClear: async () => true, improveWithAi: async () => 'improved text' })

  it('start/stop/saveConfig call the engine', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine: engine as never, ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'start', config: { sessionId: 's1' } }); v.fire({ type: 'stop' }); v.fire({ type: 'saveConfig', config: { sessionId: 's1' } })
    await new Promise((r) => setTimeout(r, 0))
    expect(engine.calls).toEqual(['start', 'stop', 'setConfig'])
  })

  it('restoreBest posts restoreResult with the sha', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine: engine as never, ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'restoreBest' }); await new Promise((r) => setTimeout(r, 0))
    const rr = v.posted.find((m) => (m as { type?: string }).type === 'restoreResult') as { ok: boolean; sha: string }
    expect(rr.ok).toBe(true); expect(rr.sha).toBe('abcdef0')
  })

  it('clearRequest confirmed → clear + re-init; declined → no clear', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine: engine as never, ...baseOpts(), confirmClear: async () => false })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'clearRequest' }); await new Promise((r) => setTimeout(r, 0))
    expect(engine.calls).not.toContain('clear')

    const engine2 = recordingEngine()
    const host2 = createWebviewHost({ engine: engine2 as never, ...baseOpts(), confirmClear: async () => true })
    const v2 = fakeView(); await host2.provider.resolveWebviewView(v2 as never)
    v2.fire({ type: 'clearRequest' }); await new Promise((r) => setTimeout(r, 0))
    expect(engine2.calls).toContain('clear')
    expect(v2.posted.filter((m) => (m as { type?: string }).type === 'init').length).toBeGreaterThanOrEqual(1)
  })

  it('improveWithAi posts aiResult', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine: engine as never, ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    v.fire({ type: 'improveWithAi', draft: 'd', evalCommand: 'e', targetGlobs: 'g' }); await new Promise((r) => setTimeout(r, 0))
    const ai = v.posted.find((m) => (m as { type?: string }).type === 'aiResult') as { ok: boolean; text: string }
    expect(ai.ok).toBe(true); expect(ai.text).toBe('improved text')
  })

  it('refresh re-posts init', async () => {
    const engine = recordingEngine()
    const host = createWebviewHost({ engine: engine as never, ...baseOpts() })
    const v = fakeView(); await host.provider.resolveWebviewView(v as never)
    host.refresh(); await new Promise((r) => setTimeout(r, 0))
    expect(v.posted.filter((m) => (m as { type?: string }).type === 'init').length).toBeGreaterThanOrEqual(1)
  })
})
```
(Keep the existing B2a tests; they still pass against the simpler `engine` — but since the const `engine` is replaced, update the B2a tests to use `recordingEngine()` too, or keep a separate minimal const. Simplest: add `const engine = recordingEngine()` at the top describe scope is not shared; define `recordingEngine` once at file top and use it in both describes.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview-host.test.ts` → FAIL (handlers/refresh/options missing).

- [ ] **Step 3: Implement the dispatch**

Rewrite `resources/plugins/manifold.loop/src/webview-host.ts`:
```ts
// resources/plugins/manifold.loop/src/webview-host.ts
// Builds the loop plugin's WebviewViewProvider: inlines the bundle into nonce-CSP-safe HTML,
// dispatches the full webview message set to the engine + injected manifold-backed callbacks,
// and bridges engine events to the view. No `manifold` import (everything injected → testable).
import type { WebviewViewProvider, WebviewView } from 'manifold'
import type { LoopConfig } from './types'
import type { WebviewMsg } from './webview/protocol'

export interface EngineFacade {
  getStatus(sessionId: string): Promise<unknown>
  getStatusSync(sessionId: string): unknown
  getIterations(): Promise<unknown[]>
  getConfig(sessionId: string): Promise<unknown>
  start(config: LoopConfig): Promise<void>
  stop(sessionId: string): Promise<void>
  setConfig(sessionId: string, config: LoopConfig): Promise<unknown>
  restoreBest(sessionId: string): Promise<{ sha: string }>
  clear(sessionId: string): Promise<unknown>
}

export interface WebviewHostOptions {
  engine: EngineFacade
  readBundle: () => string
  getActiveSessionId: () => string | null
  confirmClear: () => Promise<boolean>
  improveWithAi: (a: { draft: string; evalCommand: string; targetGlobs: string }) => Promise<string>
}

export function buildWebviewHtml(bundle: string): string {
  const safe = bundle.replace(/<\/(script)/gi, '<\\/$1')
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>html,body{margin:0;padding:0;background:var(--bg-primary,#282a36);color:var(--text-primary,#f8f8f2);font-family:var(--font-sans,system-ui)}</style>',
    '</head><body><div id="root"></div>',
    `<script>${safe}</script>`,
    '</body></html>',
  ].join('')
}

export function createWebviewHost(opts: WebviewHostOptions): {
  provider: WebviewViewProvider
  emit: (event: 'status' | 'iteration', payload: unknown) => void
  refresh: () => void
} {
  let view: WebviewView | undefined

  const post = (msg: unknown): void => { view?.webview.postMessage(msg) }

  const emit = (event: 'status' | 'iteration', payload: unknown): void => {
    if (event === 'status') post({ type: 'status', status: payload })
    else post({ type: 'iteration', iteration: payload })
  }

  const sendInit = async (): Promise<void> => {
    const sessionId = opts.getActiveSessionId()
    post({
      type: 'init',
      sessionId,
      status: sessionId ? await opts.engine.getStatus(sessionId) : null,
      iterations: await opts.engine.getIterations(),
      config: sessionId ? await opts.engine.getConfig(sessionId) : null,
    })
  }

  const handle = async (msg: WebviewMsg): Promise<void> => {
    const sessionId = opts.getActiveSessionId()
    switch (msg.type) {
      case 'ready': await sendInit(); break
      case 'start': void opts.engine.start(msg.config); break
      case 'stop': if (sessionId) await opts.engine.stop(sessionId); break
      case 'saveConfig': if (sessionId) await opts.engine.setConfig(sessionId, msg.config); break
      case 'restoreBest':
        if (!sessionId) { post({ type: 'restoreResult', ok: false, error: 'no active session' }); break }
        try { const { sha } = await opts.engine.restoreBest(sessionId); post({ type: 'restoreResult', ok: true, sha }) }
        catch (e) { post({ type: 'restoreResult', ok: false, error: (e as Error).message }) }
        break
      case 'clearRequest':
        if (sessionId && await opts.confirmClear()) { await opts.engine.clear(sessionId); await sendInit() }
        break
      case 'improveWithAi':
        try { const text = await opts.improveWithAi({ draft: msg.draft, evalCommand: msg.evalCommand, targetGlobs: msg.targetGlobs }); post({ type: 'aiResult', ok: true, text }) }
        catch (e) { post({ type: 'aiResult', ok: false, error: (e as Error).message }) }
        break
    }
  }

  const provider: WebviewViewProvider = {
    resolveWebviewView(v: WebviewView): void {
      view = v
      v.webview.html = buildWebviewHtml(opts.readBundle())
      v.webview.onDidReceiveMessage((raw: unknown) => { void handle(raw as WebviewMsg) })
    },
  }

  return { provider, emit, refresh: () => { void sendInit() } }
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run resources/plugins/manifold.loop/src/webview-host.test.ts` → PASS (B2a + new).

```bash
git add resources/plugins/manifold.loop/src/webview-host.ts resources/plugins/manifold.loop/src/webview-host.test.ts
git commit -m "feat(loop-plugin): webview host dispatches the full action protocol

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Wire the plugin callbacks + session refresh

**Files:** Modify `resources/plugins/manifold.loop/src/plugin.ts`

- [ ] **Step 1: Wire callbacks**

In `plugin.ts`, add the import:
```ts
import { buildImproveInstruction } from './improve-instruction'
```
Replace the `createWebviewHost({...})` call with the full options + session refresh:
```ts
  const host = createWebviewHost({
    engine,
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
    getActiveSessionId: () => manifold.agents.activeAgent?.sessionId ?? null,
    confirmClear: async () => (await manifold.window.showWarningMessage('Clear all iteration history for this loop? This cannot be undone.', 'Clear')) === 'Clear',
    improveWithAi: async (args) => {
      const models = await manifold.lm.selectChatModels()
      const model = models[0]
      if (!model) throw new Error('no language model available — is a default runtime configured?')
      const res = await model.sendRequest(buildImproveInstruction(args))
      return res.text
    },
  })
  engine.setEmit(host.emit)
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.loop.panel', host.provider))
  context.subscriptions.push(manifold.workspace.onDidChangeActiveSession(() => host.refresh()))
```

(The engine already exposes `start/stop/setConfig/restoreBest/clear/getStatus/getStatusSync/
getConfig/getIterations` from B1 — it satisfies `EngineFacade`. `manifold.workspace`
requires the `workspace:read` capability, already declared.)

- [ ] **Step 2: Typecheck + build + plugin suite**

Run: `npm run typecheck:plugins` → exit 0.
Run: `npm run build:plugins` → `manifold.loop` builds `out/{plugin,webview}.js`.
Run: `npx vitest run resources/plugins/manifold.loop` → all green.

- [ ] **Step 3: Commit**

```bash
git add resources/plugins/manifold.loop/src/plugin.ts
git commit -m "feat(loop-plugin): wire clear-confirm, improve-with-AI, session refresh

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Whole-feature verification

**Files:** none

- [ ] **Step 1: Build + suites**

Run: `npm run build:plugins` → emits `manifold.loop/out/{plugin,webview}.js`.
Run: `npx vitest run resources/plugins/manifold.loop` → green.
Run: `npx vitest run` → full suite green.

- [ ] **Step 2: Typechecks**

`npm run typecheck:node` → 16; `npm run typecheck:web` → 36; `npm run typecheck:plugins` → exit 0.

- [ ] **Step 3: Built-in loop untouched + sizes**

Run: `git diff --name-only main...HEAD -- src/main/loop src/renderer/components/loop src/main/ipc/loop-handlers.ts` → **empty**.
Run: `find resources/plugins/manifold.loop/src -name '*.ts*' | xargs wc -l | sort -n | tail -8` → every file < 300.

- [ ] **Step 4: Record owed dev smoke**

Append a note: owed manual verification — `npm run dev`, open "Loop (plugin)", configure a loop,
Start, watch iterations stream; Stop; Clear (confirm dialog appears); Restore Best (after an
improvement); Improve with AI (rewrites the program field); toggle theme (colors follow).

- [ ] **Step 5: Commit the note**

```bash
git add docs/superpowers/plans/2026-06-06-loop-plugin-phase-b2b-full-ui.md
git commit -m "docs(loop-plugin): record owed B2b dev smoke

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** protocol `restoreResult` → Task 1. styles split → Task 2. helpers → Task 3.
improve-instruction → Task 4. reducer → Task 5. bridge hook → Task 6. component ports
(ConfigForm `onImproveWithAi`, LoopPanel bridge + clear) → Task 7. keyframes → Task 7.
entry → Task 8. host full dispatch + refresh → Task 9. plugin callbacks + session refresh →
Task 10. verification + owed smoke → Task 11. ✓

**Placeholder scan:** the component ports (Tasks 7) reference an exact source file + the precise
edits (imports + the two swapped blocks); not vague. The styles split (Task 2) lists every key's
destination explicitly. No TODO/TBD.

**Type consistency:** `UiLoopState`/`applyHostMsg`/`EMPTY_LOOP_STATE` (Task 5) used by the hook
(Task 6). `LoopBridge` exposes `start/stop/saveConfig/clear/restoreBest/improveWithAi` consumed
by `LoopPanel` (Task 7). `EngineFacade` (Task 9) matches the B1 `LoopEngine` method names
(`start/stop/setConfig/restoreBest/clear/getStatus/getStatusSync/getConfig/getIterations`) and
the plugin wiring (Task 10). `WebviewHostOptions` (`confirmClear`/`improveWithAi`) match Task 10's
call. `buildImproveInstruction` signature (Task 4) matches its caller (Task 10). `restoreResult`/
`aiResult` shapes match between host (Task 9), protocol (Task 1), and bridge (Task 6). Styles
index re-exports `loopPanelStyles`/`outcomeColors`/`stateColors` consumed by all three components.

**Scope:** parity UI port + wiring; built-in loop untouched (asserted Task 11); no Phase C
removal. Styles split is the one structural change (driven by < 300 LOC).
