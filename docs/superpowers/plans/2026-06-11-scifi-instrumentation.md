# Sci-fi Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five whisper-level sci-fi instrumentation elements (reticle focus, chamfered corners, sensor sweep, warp-core pulse, starfield horizon) to all themes via adapter-derived tokens.

**Architecture:** Three new per-theme tokens derived in `src/shared/themes/adapter.ts` (`--effect-glow`, `--star-tint`, `--grid-tint`), consumed by pure-CSS effects in `src/renderer/styles/theme.css` with fallbacks. One new React component (`StarfieldBackdrop`) for the only element that needs DOM. One className wire-up in `AgentItem`. No theme-conditional logic anywhere.

**Tech Stack:** TypeScript, React 18, vitest + @testing-library/react (jest-dom matchers available in renderer tests), plain CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-06-11-scifi-instrumentation-design.md`

**Delivery:** Two stacked PRs. PR 1 = Tasks 1–6 (tokens + CSS elements A–D). PR 2 = Tasks 7–9 (starfield + docs). Task 10 creates both PRs.

---

## Project conventions you must know

- **Run tests with `npm test`, never `npx vitest`** — the `pretest` hook rebuilds `better-sqlite3` for the system-Node ABI. Single file: `npm test -- path/to/file.test.ts`.
- **Known local failure:** this worktree uses a **symlinked** `node_modules`; 4 editor suites fail with `Denied ID … pdf.worker…?url`. That is a pre-existing local artifact (green on CI) — record it in the baseline and ignore it.
- **Typecheck:** `npm run typecheck:web` (baseline **37** errors) and `npm run typecheck:node` (baseline **12**). `npm run typecheck` alone is a no-op. Do not introduce *new* errors.
- **Worktree git hygiene:** run `git fsck --no-dangling` before each commit batch. The pre-commit hook rejects commits adding the forbidden company name — irrelevant here, but don't name the user's employer anywhere.
- **Design rules:** token-only colors, no theme-conditional CSS, restrained motion, every pixel communicates state or structure.

### Task 0: Workspace setup + baseline

- [ ] **Step 0.1:** Symlink node_modules (worktrees don't have one):

```bash
ln -s /Users/svenmalvik/git/manifold/node_modules /Users/svenmalvik/.manifold/worktrees/manifold/manifold-fauske-4/node_modules
```

- [ ] **Step 0.2:** Baseline the suite and typechecks:

```bash
npm test 2>&1 | tail -20
npm run typecheck:web 2>&1 | tail -3   # expect: 37 errors
npm run typecheck:node 2>&1 | tail -3  # expect: 12 errors
```

Expected: all suites pass **except** up to 4 editor suites failing with `Denied ID …pdf.worker…?url` (known local artifact). Note the exact failing files; the final verification must show the same set, no more.

---

### Task 1: Adapter tokens (`--effect-glow`, `--star-tint`, `--grid-tint`)

**Files:**
- Modify: `src/shared/themes/adapter.ts` (after the `--tree-icon-active-filter` block, ~line 212)
- Test: `src/shared/themes/adapter.test.ts`

- [ ] **Step 1.1: Write the failing test.** Append inside `describe('convertTheme', …)`:

```typescript
  it('derives instrumentation effect tints per theme type', () => {
    const dark = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#E2C275',
      },
    }, 'test')

    expect(dark.cssVars['--effect-glow']).toBe('rgba(226, 194, 117, 0.16)')
    expect(dark.cssVars['--star-tint']).toBe('rgba(230, 236, 247, 0.5)')
    expect(dark.cssVars['--grid-tint']).toBe('rgba(226, 194, 117, 0.1)')

    const light = convertTheme({
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1E1E1E',
        focusBorder: '#007acc',
      },
    }, 'test')

    expect(light.cssVars['--effect-glow']).toBe('rgba(0, 122, 204, 0.1)')
    expect(light.cssVars['--star-tint']).toBe('rgba(30, 30, 30, 0.38)')
    expect(light.cssVars['--grid-tint']).toBe('rgba(0, 122, 204, 0.07)')
  })
```

- [ ] **Step 1.2:** Run `npm test -- src/shared/themes/adapter.test.ts` — expect FAIL (`--effect-glow` undefined).

- [ ] **Step 1.3: Implement.** In `adapter.ts`, directly after the `cssVars['--tree-icon-active-filter'] = …` statement:

```typescript
  // Sci-fi instrumentation (whisper level): pre-mixed effect tints. Light
  // themes get fainter glows (a glow reads as a smudge on paper) and ink-dot
  // starfields; dark themes get accent-metal light.
  cssVars['--effect-glow'] = withOpacity(accent, isDark ? 0.16 : 0.1)
  cssVars['--star-tint'] = withOpacity(editorFg, isDark ? 0.5 : 0.38)
  cssVars['--grid-tint'] = withOpacity(accent, isDark ? 0.1 : 0.07)
```

(`withOpacity` is already imported.)

- [ ] **Step 1.4:** Run `npm test -- src/shared/themes/adapter.test.ts` — expect PASS.

- [ ] **Step 1.5: Commit**

```bash
git add src/shared/themes/adapter.ts src/shared/themes/adapter.test.ts
git commit -m "feat(themes): derive instrumentation effect tints per theme"
```

---

### Task 2: Targeting-reticle focus (CSS only)

**Files:**
- Modify: `src/renderer/styles/theme.css:356-369`

- [ ] **Step 2.1:** Replace this exact block:

```css
input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent) !important;
}

button:focus-visible,
[role='button']:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle);
}
```

with:

```css
/* Targeting-reticle focus: text fields swap the plain accent border for four
   corner brackets — the UI locks on to where you type. !important mirrors the
   old border rule: inline `background` shorthands on inputs would otherwise
   reset the bracket layers. Each corner is two thin gradient bars. */
input:focus,
textarea:focus {
  border-color: transparent !important;
  background-image:
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)) !important;
  background-repeat: no-repeat !important;
  background-origin: border-box !important;
  background-clip: border-box !important;
  background-size:
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px !important;
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom !important;
}

select:focus {
  border-color: var(--accent) !important;
}

button:focus-visible,
[role='button']:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle);
}
```

(Inputs/textareas leave the focus-visible ring list deliberately — the brackets are their focus indicator on every focus, keyboard included.)

- [ ] **Step 2.2:** Sanity check no other rule re-adds the ring to inputs: `git grep -n "input:focus-visible" src/renderer` — expect no hits.

- [ ] **Step 2.3: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat(design): targeting-reticle focus brackets on text fields"
```

---

### Task 3: Chamfered corners on `.btn-metal` + workspace card (CSS only)

**Files:**
- Modify: `src/renderer/styles/theme.css` (`.btn-metal` block ~line 782, workspace card block ~line 708)

- [ ] **Step 3.1:** Replace the `.btn-metal` base + hover rules:

```css
.btn-metal,
.sidebar-action-button--primary {
  color: var(--btn-text);
  background: linear-gradient(135deg, var(--btn-hover), var(--btn-bg));
  border: 1px solid color-mix(in srgb, var(--accent-dim, var(--accent)), transparent 40%);
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), var(--shadow-glow);
  /* Machined plate: opposing 45° chamfers. clip-path clips outer box-shadows,
     so depth is restored as drop-shadows that follow the chamfered silhouette. */
  clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.28)) drop-shadow(0 0 8px var(--effect-glow, transparent));
  transition: filter var(--duration-normal) var(--ease-premium), box-shadow var(--duration-normal) var(--ease-premium);
}

.btn-metal:hover:not(:disabled),
.sidebar-action-button--primary:hover {
  filter: brightness(1.1) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.28)) drop-shadow(0 0 8px var(--effect-glow, transparent));
}
```

- [ ] **Step 3.2:** Extend the workspace card rule (keep the existing comment above it):

```css
.sidebar-project-group--has-agents.sidebar-workspace-card {
  border-color: color-mix(in srgb, var(--accent), transparent 58%);
  /* Console plate: the active workspace cuts opposing corners too. */
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}
```

- [ ] **Step 3.3: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat(design): chamfer the metal CTA and workspace card"
```

---

### Task 4: Sensor sweep on outputting agent rows

**Files:**
- Modify: `src/renderer/components/sidebar/AgentItem.tsx:128`
- Modify: `src/renderer/styles/theme.css` (after `.sidebar-agent-row--exited`, ~line 624)
- Test: `src/renderer/components/sidebar/AgentItem.test.tsx`

- [ ] **Step 4.1: Write the failing test.** Append to `AgentItem.test.tsx`:

```tsx
describe('AgentItem sensor sweep', () => {
  const baseProps = {
    projectPath: '/tmp/proj',
    isActive: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
  }

  it('adds the outputting modifier while the agent streams output', () => {
    const { container } = render(<AgentItem {...baseProps} isOutputting session={makeSession()} />)
    expect(container.querySelector('.sidebar-agent-row')).toHaveClass('sidebar-agent-row--outputting')
  })

  it('omits the outputting modifier when idle', () => {
    const { container } = render(<AgentItem {...baseProps} isOutputting={false} session={makeSession()} />)
    expect(container.querySelector('.sidebar-agent-row')).not.toHaveClass('sidebar-agent-row--outputting')
  })
})
```

- [ ] **Step 4.2:** Run `npm test -- src/renderer/components/sidebar/AgentItem.test.tsx` — expect the first new test to FAIL.

- [ ] **Step 4.3: Implement.** In `AgentItem.tsx:128`, change the row className to:

```tsx
      className={`sidebar-item-row sidebar-agent-row ${session.status === 'done' || session.status === 'error' ? 'sidebar-agent-row--exited' : 'sidebar-agent-row--alive'}${isOutputting ? ' sidebar-agent-row--outputting' : ''}${isActive ? ' sidebar-item-row--active' : ''}`}
```

- [ ] **Step 4.4:** Run `npm test -- src/renderer/components/sidebar/AgentItem.test.tsx` — expect PASS.

- [ ] **Step 4.5: Add the CSS.** In `theme.css`, after the `.sidebar-agent-row--exited` rule:

```css
/* Sensor sweep: a slow, faint band of accent light crosses the row while its
   agent streams output — a long-range scan, not a loading bar. */
.sidebar-agent-row--outputting {
  position: relative;
  overflow: hidden;
}

.sidebar-agent-row--outputting::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--effect-glow, var(--accent-subtle)) 50%, transparent) no-repeat;
  background-size: 90px 100%;
  background-position: -90px 0;
  animation: agent-scan 3.2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes agent-scan {
  0% { background-position: -90px 0; }
  60%, 100% { background-position: calc(100% + 90px) 0; }
}
```

- [ ] **Step 4.6: Commit**

```bash
git add src/renderer/components/sidebar/AgentItem.tsx src/renderer/components/sidebar/AgentItem.test.tsx src/renderer/styles/theme.css
git commit -m "feat(design): sensor sweep across outputting agent rows"
```

---

### Task 5: Warp-core pulse + reduced-motion guard (CSS only)

**Files:**
- Modify: `src/renderer/styles/theme.css:381-388` (`dot-blink` + `.status-dot--active`)

- [ ] **Step 5.1:** Confirm `dot-blink` has no other consumers: `git grep -n "dot-blink" -- src` — expect hits only in `theme.css`.

- [ ] **Step 5.2:** Replace:

```css
@keyframes dot-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.25; }
}

.status-dot--active {
  animation: dot-blink 1.4s ease-in-out infinite;
}
```

with:

```css
/* Warp-core pulse: the running dot breathes a slow accent glow instead of
   blinking — the heartbeat of the ship. */
@keyframes core-pulse {
  0%, 100% { box-shadow: 0 0 3px 1px var(--effect-glow, var(--accent-subtle)); }
  50% {
    box-shadow:
      0 0 6px 2px var(--effect-glow, var(--accent-subtle)),
      0 0 14px 4px var(--effect-glow, var(--accent-subtle));
  }
}

.status-dot--active {
  animation: core-pulse 2.4s ease-in-out infinite;
}
```

- [ ] **Step 5.3:** Add at the end of `theme.css`:

```css
/* ─── Reduced motion: instrumentation effects go static ─── */
@media (prefers-reduced-motion: reduce) {
  .status-dot--active,
  .sidebar-agent-row--outputting::after {
    animation: none;
  }
}
```

- [ ] **Step 5.4: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat(design): warp-core pulse for the running dot, reduced-motion guard"
```

---

### Task 6: PR 1 verification gate

- [ ] **Step 6.1:** `git fsck --no-dangling` — expect clean.
- [ ] **Step 6.2:** `npm test` — expect same pass/fail set as the Task 0 baseline (only the known `pdf.worker?url` locals).
- [ ] **Step 6.3:** `npm run typecheck:web` (≤37 errors) and `npm run typecheck:node` (≤12 errors).
- [ ] **Step 6.4:** Record the metalwork tip: `git rev-parse HEAD` — this SHA becomes branch `manifold/scifi-metalwork` in Task 10.

---

### Task 7: `StarfieldBackdrop` component (TDD)

**Files:**
- Create: `src/renderer/components/StarfieldBackdrop.tsx`
- Test: `src/renderer/components/StarfieldBackdrop.test.tsx`

- [ ] **Step 7.1: Write the failing test** (`StarfieldBackdrop.test.tsx`):

```tsx
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { StarfieldBackdrop } from './StarfieldBackdrop'

describe('StarfieldBackdrop', () => {
  it('renders an aria-hidden decoration with star and grid layers', () => {
    const { container } = render(<StarfieldBackdrop />)

    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.getAttribute('data-testid')).toBe('starfield-backdrop')
    expect(root.style.pointerEvents).toBe('none')
    expect(root.children).toHaveLength(2)

    const stars = root.children[0] as HTMLElement
    expect(stars.style.backgroundImage).toContain('radial-gradient')
    expect(stars.style.backgroundImage).toContain('var(--star-tint')

    const horizon = root.children[1] as HTMLElement
    expect(horizon.style.backgroundImage).toContain('repeating-linear-gradient')
    expect(horizon.style.transform).toContain('perspective')
  })
})
```

- [ ] **Step 7.2:** Run `npm test -- src/renderer/components/StarfieldBackdrop.test.tsx` — expect FAIL (module not found).

- [ ] **Step 7.3: Implement** (`StarfieldBackdrop.tsx`):

```tsx
import React from 'react'

// A designed constellation, not a random scatter — deterministic so every
// launch looks identical. [x%, y%, size(px), tint strength 0–1]
const STARS: Array<[number, number, number, number]> = [
  [8, 18, 1, 0.7], [16, 62, 1, 0.35], [23, 34, 1.5, 0.5], [31, 11, 1, 0.6],
  [38, 71, 1, 0.3], [47, 26, 1, 0.8], [54, 55, 1.5, 0.4], [61, 9, 1, 0.5],
  [68, 38, 1, 0.65], [74, 66, 1, 0.3], [81, 21, 1.5, 0.55], [88, 47, 1, 0.7],
  [93, 12, 1, 0.4], [12, 44, 1, 0.45], [85, 74, 1, 0.35],
]

const starLayers = STARS.map(([x, y, size, strength]) =>
  `radial-gradient(${size}px ${size}px at ${x}% ${y}%, color-mix(in srgb, var(--star-tint, var(--text-muted)) ${Math.round(strength * 100)}%, transparent) 50%, transparent 50%)`
).join(', ')

const styles: Record<string, React.CSSProperties> = {
  root: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  stars: {
    position: 'absolute',
    inset: 0,
    backgroundImage: starLayers,
  },
  horizon: {
    position: 'absolute',
    left: '-20%',
    right: '-20%',
    bottom: 0,
    height: '38%',
    backgroundImage: [
      'repeating-linear-gradient(90deg, var(--grid-tint, transparent) 0 1px, transparent 1px 64px)',
      'repeating-linear-gradient(0deg, var(--grid-tint, transparent) 0 1px, transparent 1px 28px)',
    ].join(', '),
    transform: 'perspective(420px) rotateX(58deg)',
    transformOrigin: 'bottom center',
    maskImage: 'linear-gradient(180deg, transparent, black 78%)',
    WebkitMaskImage: 'linear-gradient(180deg, transparent, black 78%)',
  },
}

/**
 * Whisper-level starfield + perspective horizon grid behind empty-state
 * heroes. Pure decoration: aria-hidden, pointer-events: none, static.
 */
export function StarfieldBackdrop(): React.JSX.Element {
  return (
    <div aria-hidden="true" data-testid="starfield-backdrop" style={styles.root}>
      <div style={styles.stars} />
      <div style={styles.horizon} />
    </div>
  )
}
```

- [ ] **Step 7.4:** Run `npm test -- src/renderer/components/StarfieldBackdrop.test.tsx` — expect PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/renderer/components/StarfieldBackdrop.tsx src/renderer/components/StarfieldBackdrop.test.tsx
git commit -m "feat(design): StarfieldBackdrop — static constellation + horizon grid"
```

---

### Task 8: Integrate the starfield into both ghost homes

**Files:**
- Modify: `src/renderer/components/modals/OnboardingView.tsx` (root div, ~line 89)
- Modify: `src/renderer/components/editor/AgentChatView.tsx` (`AgentChatEmptyState`, ~line 64; `emptyStyles.container`, ~line 85)
- Create: `src/renderer/components/modals/OnboardingView.test.tsx`
- Test: `src/renderer/components/editor/AgentChatView.test.tsx`

- [ ] **Step 8.1: Write the failing tests.** New file `OnboardingView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { OnboardingView } from './OnboardingView'

describe('OnboardingView starfield', () => {
  it('renders the starfield backdrop behind the no-project hero', () => {
    render(
      <OnboardingView
        variant="no-project"
        onAddProject={vi.fn()}
        onCloneProject={vi.fn(async () => true)}
        onCreateNewProject={vi.fn(async () => true)}
      />
    )

    expect(screen.getByTestId('starfield-backdrop')).toBeInTheDocument()
  })
})
```

Append to the `describe('AgentChatView', …)` block in `AgentChatView.test.tsx` (the default mock already returns zero messages, which renders the empty state):

```tsx
  it('renders the starfield backdrop behind the empty state', async () => {
    render(<AgentChatView sessionId="sess-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('starfield-backdrop')).toBeInTheDocument()
    })
  })
```

- [ ] **Step 8.2:** Run both — expect FAIL (testid not found). If `AgentChatView.test.tsx` is one of the known `pdf.worker?url` local failures, note it and rely on the OnboardingView test + CI for the assertion.

```bash
npm test -- src/renderer/components/modals/OnboardingView.test.tsx src/renderer/components/editor/AgentChatView.test.tsx
```

- [ ] **Step 8.3: Implement OnboardingView.** Add the import:

```tsx
import { StarfieldBackdrop } from '../StarfieldBackdrop'
```

In the root `<div>` style object add `position: 'relative'` (above `flex: 1`), and render the backdrop as the first child, before `<ManifoldWordmark size="normal" />`:

```tsx
    <div
      style={{
        position: 'relative',
        flex: 1,
        /* …existing style props unchanged… */
      }}
    >
      <StarfieldBackdrop />
      <ManifoldWordmark size="normal" />
```

- [ ] **Step 8.4: Implement AgentChatView.** Add the import:

```tsx
import { StarfieldBackdrop } from '../StarfieldBackdrop'
```

In `AgentChatEmptyState`, render the backdrop first:

```tsx
function AgentChatEmptyState(): React.JSX.Element {
  return (
    <div style={emptyStyles.container}>
      <StarfieldBackdrop />
      <div style={emptyStyles.logo} aria-hidden="true">
```

and add `position: 'relative' as const,` to `emptyStyles.container`.

- [ ] **Step 8.5:** Re-run the two test files — expect PASS (modulo the known local artifact).

- [ ] **Step 8.6: Commit**

```bash
git add src/renderer/components/modals/OnboardingView.tsx src/renderer/components/modals/OnboardingView.test.tsx src/renderer/components/editor/AgentChatView.tsx src/renderer/components/editor/AgentChatView.test.tsx
git commit -m "feat(design): starfield horizon behind the empty-state heroes"
```

---

### Task 9: Docs wiki sync

**Files:**
- Modify: `docs/architecture/renderer.md` (frontmatter + the Theme bullet if needed)

- [ ] **Step 9.1:** `renderer.md` has `covers: [src/renderer]`. Verify its claims still hold against the diff (no structural claims changed — we added a component and CSS). Bump `updated:` to today's date if it isn't already `2026-06-11`.
- [ ] **Step 9.2:** Run `bash scripts/wiki-lint.sh` — fix anything it flags about pages covering the touched paths.
- [ ] **Step 9.3:** Commit only if a doc changed:

```bash
git add docs/architecture/renderer.md && git commit -m "docs(wiki): sync renderer page after instrumentation changes"
```

---

### Task 10: Final verification + stacked PRs

- [ ] **Step 10.1:** `git fsck --no-dangling`; full `npm test`; `npm run typecheck:web` (≤37) and `npm run typecheck:node` (≤12). Same failure set as baseline only.
- [ ] **Step 10.2: Verify in the built app** (use the project's Playwright driver pattern; dev profile auto-isolates, strip `ELECTRON_RENDERER_URL` before `electron.launch`). Probe computed styles in Royal Dark and one light theme:
  - focused chat prompt → `getComputedStyle(el).backgroundImage` contains 8 `linear-gradient` layers;
  - `.btn-metal` → `clipPath` starts with `polygon(9px 0px`;
  - `.status-dot--active` → `animationName === 'core-pulse'`;
  - an outputting row → `::after` `animationName === 'agent-scan'` (needs a streaming agent; if impractical, assert the class wiring via the unit test and check the keyframes exist in the stylesheet);
  - no-agent onboarding → `[data-testid="starfield-backdrop"]` present;
  - `documentElement` style → `--effect-glow`, `--star-tint`, `--grid-tint` set, and change after switching theme.
- [ ] **Step 10.3: Stacked PRs** (use the gh-create-pr skill conventions; METALWORK_SHA from Step 6.4):

```bash
git push origin <METALWORK_SHA>:refs/heads/manifold/scifi-metalwork
gh pr create --base main --head manifold/scifi-metalwork --title "feat(design): sci-fi instrumentation — reticle focus, chamfers, sweep, core pulse"
git push origin HEAD:refs/heads/manifold/scifi-starfield
gh pr create --base manifold/scifi-metalwork --head manifold/scifi-starfield --title "feat(design): starfield horizon behind empty-state heroes"
```

PR bodies: summary per element, spec/plan links, test + verification evidence, and the standard generated-with footer.
