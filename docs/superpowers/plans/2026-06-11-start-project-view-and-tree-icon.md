# Start-Project View Redesign + Accent-Tinted Active Tree Icon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the "Start a new project" view in line with the new-agent hero language (serif heading, mode pill, metallic CTA, single-phase form) and tint the active file's tree icon with a theme-derived accent filter.

**Architecture:** Two independent parts. Part A adds a computed CSS token (`--tree-icon-active-filter`) in the theme adapter and consumes it in `theme.css` with a monochrome fallback. Part B rewrites `NoProjectActions.tsx` from a two-phase reveal into a single always-visible form that reuses the agent form's pill/CTA styles. Spec: `docs/superpowers/specs/2026-06-11-start-project-view-and-tree-icon-design.md`.

**Tech Stack:** React 18 + inline `React.CSSProperties` styles (no CSS-in-JS libs), CSS custom properties in `src/renderer/styles/theme.css`, Vitest + @testing-library/react (jest-dom matchers available in renderer tests).

---

## Project conventions you must know

- **Run tests with `npm test`, never `npx vitest`** — the `pretest` hook rebuilds `better-sqlite3` for the system Node ABI. `npm test -- path/to/file.test.ts` targets one file.
- **Typecheck baselines are not zero.** `npm run typecheck:web` has 37 pre-existing errors, `npm run typecheck:node` has 12 (as of 2026-06-11). `npm run typecheck` (no suffix) is a no-op — don't use it. Success = no *new* errors over baseline.
- **Known local artifact:** in this worktree (symlinked `node_modules`), 4 editor suites fail with `Denied ID pdf.worker?url`. Pre-existing, green on CI — not caused by your changes. Compare against the Task 0 baseline.
- **Token-only colors.** Never hardcode hex/rgb in component styles; use `var(--token)`.
- **Commit messages** end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Run `git fsck --no-dangling` once before the first commit (we're in a git worktree).
- **Don't restyle untouched parts.** The clone form, divider, and secondary buttons keep their current styling.

---

### Task 0: Baseline

**Files:** none modified.

- [ ] **Step 0.1: Ensure node_modules exists**

Run: `ls /Users/svenmalvik/.manifold/worktrees/manifold/manifold-tonsberg-6/node_modules >/dev/null 2>&1 && echo OK || ln -s ~/git/manifold/node_modules /Users/svenmalvik/.manifold/worktrees/manifold/manifold-tonsberg-6/node_modules`
Expected: `OK` (or symlink created).

- [ ] **Step 0.2: Record test baseline**

Run: `npm test 2>&1 | tail -20`
Expected: suite mostly green; note any pre-existing failures (the 4 `pdf.worker?url` editor suites are known-local). Save this list — it's your comparison point.

- [ ] **Step 0.3: Record typecheck baselines**

Run: `npm run typecheck:web 2>&1 | grep -c "error TS"; npm run typecheck:node 2>&1 | grep -c "error TS"`
Expected: approximately `37` and `12`. Record the exact numbers.

---

### Task 1: `--tree-icon-active-filter` token (adapter + color utils)

**Files:**
- Modify: `src/shared/themes/theme-color-utils.ts` (add `hexToHsl`)
- Modify: `src/shared/themes/adapter.ts` (compute token; import `hexToHsl`)
- Test: `src/shared/themes/adapter.test.ts`

- [ ] **Step 1.1: Write the failing test**

Append inside the existing `describe('convertTheme', ...)` block in `src/shared/themes/adapter.test.ts`:

```ts
  it('derives the active tree icon tint filter from the accent', () => {
    const blue = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#007acc',
      },
    }, 'test')

    expect(blue.cssVars['--tree-icon-active-filter']).toBe(
      'grayscale(1) sepia(1) hue-rotate(164deg) saturate(2.22) brightness(1.08) opacity(1)'
    )

    const gold = convertTheme({
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#06080F',
        'editor.foreground': '#E6ECF7',
        focusBorder: '#d4b46a',
      },
    }, 'test')

    expect(gold.cssVars['--tree-icon-active-filter']).toBe(
      'grayscale(1) sepia(1) hue-rotate(2deg) saturate(1.23) brightness(1.08) opacity(1)'
    )
  })
```

(Math check, so you can trust the expected strings: `#007acc` → HSL hue 204.12°, sat 1.0 → `round(204.12 − 40) = 164`, `clamp(1.0/0.45, 0.4, 3) = 2.22`. `#d4b46a` → hue 41.89°, sat 0.552 → `round(1.89) = 2`, `0.552/0.45 = 1.23`.)

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- src/shared/themes/adapter.test.ts`
Expected: FAIL — `expected undefined to be 'grayscale(1) sepia(1) hue-rotate(164deg) …'`

- [ ] **Step 1.3: Add `hexToHsl` to theme-color-utils**

Append to `src/shared/themes/theme-color-utils.ts`:

```ts
/** Convert hex to HSL: hue in degrees [0, 360), saturation and lightness as 0–1 fractions. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}
```

- [ ] **Step 1.4: Compute the token in the adapter**

In `src/shared/themes/adapter.ts`:

1. Add `hexToHsl` to the import list from `./theme-color-utils` (line 3–11).
2. After the surface-tinting block (after line 202, the `--shadow-glow` assignment), add:

```ts
  // Active-file tree icon: tint the monochrome icon toward the theme accent
  // while preserving internal luminance detail. sepia(1) lands grays at ~40°,
  // so rotating by (accentHue − 40) lands them on the accent hue.
  const [accentHue, accentSat] = hexToHsl(accent)
  const hueRotate = Math.round(accentHue - 40)
  const saturate = Math.min(3, Math.max(0.4, accentSat / 0.45)).toFixed(2)
  cssVars['--tree-icon-active-filter'] =
    `grayscale(1) sepia(1) hue-rotate(${hueRotate}deg) saturate(${saturate}) brightness(1.08) opacity(1)`
```

(`accent` is already in scope — defined at line 58.)

- [ ] **Step 1.5: Run test to verify it passes**

Run: `npm test -- src/shared/themes/adapter.test.ts`
Expected: PASS (both existing and new tests).

- [ ] **Step 1.6: Commit**

```bash
git fsck --no-dangling
git add src/shared/themes/theme-color-utils.ts src/shared/themes/adapter.ts src/shared/themes/adapter.test.ts
git commit -m "feat(themes): derive --tree-icon-active-filter from the theme accent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Consume the token in theme.css

**Files:**
- Modify: `src/renderer/styles/theme.css:1288-1290`

- [ ] **Step 2.1: Replace the active-icon rule**

Current rule at `src/renderer/styles/theme.css:1288`:

```css
.file-tree-row.file-tree-row--active .file-tree-icon {
  filter: grayscale(1) brightness(1.08) opacity(1);
}
```

Replace with:

```css
.file-tree-row.file-tree-row--active .file-tree-icon {
  /* Accent-tinted: the open file is the only icon that earns color.
     Fallback preserves the monochrome treatment if the token is absent. */
  filter: var(--tree-icon-active-filter, grayscale(1) brightness(1.08) opacity(1));
}
```

Do NOT touch the base rule (line 1281) or the hover rule (line 1285) — hover/selected rows stay monochrome.

- [ ] **Step 2.2: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat(design): tint the active file's tree icon with the theme accent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: NoProjectActions — single-phase form with pill + metallic CTA

**Files:**
- Modify: `src/renderer/components/sidebar/NoProjectActions.tsx` (full rewrite of the create-flow portion)
- Test: `src/renderer/components/sidebar/NoProjectActions.test.tsx` (full rewrite)

- [ ] **Step 3.1: Rewrite the test file**

Replace the entire contents of `src/renderer/components/sidebar/NoProjectActions.test.tsx` with:

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NoProjectActions } from './NoProjectActions'

function renderActions(overrides: Partial<React.ComponentProps<typeof NoProjectActions>> = {}) {
  const props: React.ComponentProps<typeof NoProjectActions> = {
    onAddProject: vi.fn(),
    onCloneProject: vi.fn(async () => true),
    onCreateNewProject: vi.fn(async () => true),
    creatingProject: false,
    cloningProject: false,
    createError: null,
    ...overrides,
  }

  return {
    ...render(<NoProjectActions {...props} />),
    props,
  }
}

describe('NoProjectActions', () => {
  it('shows the prompt textarea immediately, defaulting to copied instructions', () => {
    renderActions()

    expect(screen.getByPlaceholderText('Paste the copied project instructions...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Copied instructions' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
  })

  it('switches the placeholder when selecting From scratch', () => {
    renderActions()

    fireEvent.click(screen.getByRole('tab', { name: 'From scratch' }))

    expect(screen.getByPlaceholderText('Describe what you want to build...')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'From scratch' })).toHaveAttribute('aria-selected', 'true')
  })

  it('submits a scratch project without projectKind', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.click(screen.getByRole('tab', { name: 'From scratch' }))
    fireEvent.change(screen.getByPlaceholderText('Describe what you want to build...'), {
      target: { value: 'Build a focus timer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Build a focus timer',
      })
    })
  })

  it('submits copied instructions as a plain folder project', async () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: 'Clone the prepared repository and continue.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect(onCreateNewProject).toHaveBeenCalledWith({
        description: 'Clone the prepared repository and continue.',
        projectKind: 'folder',
      })
    })
  })

  it('keeps Start Project disabled for whitespace-only input', () => {
    const onCreateNewProject = vi.fn(async () => true)
    renderActions({ onCreateNewProject })

    fireEvent.change(screen.getByPlaceholderText('Paste the copied project instructions...'), {
      target: { value: '   ' },
    })

    expect(screen.getByRole('button', { name: 'Start Project' })).toBeDisabled()
    expect(onCreateNewProject).not.toHaveBeenCalled()
  })

  it('clears the textarea after a successful create', async () => {
    renderActions()

    const textarea = screen.getByPlaceholderText('Paste the copied project instructions...')
    fireEvent.change(textarea, { target: { value: 'Copied setup prompt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start Project' }))

    await waitFor(() => {
      expect((textarea as HTMLTextAreaElement).value).toBe('')
    })
  })
})
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `npm test -- src/renderer/components/sidebar/NoProjectActions.test.tsx`
Expected: FAIL — `Unable to find an element with the placeholder text of: Paste the copied project instructions...` (the textarea is behind the old button phase).

- [ ] **Step 3.3: Rewrite the component**

Replace the entire contents of `src/renderer/components/sidebar/NoProjectActions.tsx` with:

```tsx
import React, { useRef, useState, useCallback } from 'react'
import type { CreateProjectOptions } from '../../../shared/types'
import { modeToggleStyles, startButtonStyle } from '../modals/NewAgentForm.styles'

type PromptMode = 'scratch' | 'copied'

const PROMPT_MODES: Array<{ id: PromptMode; label: string }> = [
  { id: 'copied', label: 'Copied instructions' },
  { id: 'scratch', label: 'From scratch' },
]

const buttonStyle: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent-text)',
  backgroundColor: 'var(--accent)',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
}

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  color: 'var(--text-primary)',
  backgroundColor: 'var(--control-bg)',
  border: '1px solid var(--control-border)',
}

const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--type-display)',
  fontWeight: 400,
  color: 'var(--text-primary)',
  letterSpacing: 'var(--tracking-tight)',
}

const headingEmphasisStyle: React.CSSProperties = {
  fontStyle: 'italic',
  fontWeight: 500,
  color: 'var(--accent-hi, var(--text-primary))',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  fontSize: 'var(--type-ui)',
  lineHeight: 1.5,
  backgroundColor: 'var(--bg-input)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)',
  outline: 'none',
  resize: 'vertical',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const promptPlaceholderByMode: Record<PromptMode, string> = {
  scratch: 'Describe what you want to build...',
  copied: 'Paste the copied project instructions...',
}

export function NoProjectActions({
  onAddProject,
  onCloneProject,
  onCreateNewProject,
  creatingProject,
  cloningProject,
  createError,
}: {
  onAddProject: () => void
  onCloneProject: (url: string) => Promise<boolean>
  onCreateNewProject: (options: CreateProjectOptions) => Promise<boolean>
  creatingProject?: boolean
  cloningProject?: boolean
  createError?: string | null
}): React.JSX.Element {
  const [promptMode, setPromptMode] = useState<PromptMode>('copied')
  const [hoveredMode, setHoveredMode] = useState<PromptMode | null>(null)
  const [description, setDescription] = useState('')
  const [cloneUrl, setCloneUrl] = useState('')
  const [showClone, setShowClone] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const handleCreateSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const trimmed = description.trim()
      if (!trimmed || creatingProject) return
      const created = await onCreateNewProject({
        description: trimmed,
        ...(promptMode === 'copied' ? { projectKind: 'folder' as const } : {}),
      })
      if (created) {
        setDescription('')
      }
    },
    [description, promptMode, creatingProject, onCreateNewProject]
  )

  const handleCloneSubmit = useCallback(
    async (e: React.FormEvent): Promise<void> => {
      e.preventDefault()
      const url = cloneUrl.trim()
      if (url && !cloningProject) {
        const success = await onCloneProject(url)
        if (success) {
          setCloneUrl('')
          setShowClone(false)
        }
      }
    },
    [cloneUrl, cloningProject, onCloneProject]
  )

  const canSubmit = description.trim().length > 0 && !creatingProject

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-lg)' }}>
        <div style={headingStyle}>
          Start a <span style={headingEmphasisStyle}>new project</span>
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => void handleCreateSubmit(e)}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', width: 480, maxWidth: '90%' }}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={promptPlaceholderByMode[promptMode]}
            autoFocus
            rows={5}
            style={textareaStyle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey && canSubmit) {
                e.preventDefault()
                formRef.current?.requestSubmit()
              }
            }}
          />
          <div style={modeToggleStyles.wrapper}>
            <div style={modeToggleStyles.track} role="tablist" aria-label="Project start mode">
              {PROMPT_MODES.map((m) => {
                const active = promptMode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPromptMode(m.id)}
                    onMouseEnter={() => setHoveredMode(m.id)}
                    onMouseLeave={() => setHoveredMode(null)}
                    style={{
                      ...modeToggleStyles.segment,
                      ...(active ? modeToggleStyles.segmentActive : {}),
                      ...(!active && hoveredMode === m.id ? modeToggleStyles.segmentHover : {}),
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-metal"
              style={{ ...startButtonStyle(canSubmit, Boolean(creatingProject)), gap: 6 }}
              aria-busy={creatingProject || undefined}
            >
              {creatingProject && <span className="spinner" aria-hidden="true" />}
              {creatingProject ? 'Creating…' : 'Start Project'}
            </button>
          </div>
          {createError && !showClone && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)', textAlign: 'center' }}>{createError}</div>
          )}
        </form>
      </div>

      <div style={{
        width: 480,
        maxWidth: '90%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        margin: '8px 0',
      }}>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>or open an existing repository</span>
        <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onAddProject} style={secondaryButtonStyle}>+ Add Local Repository</button>
        <button onClick={() => setShowClone((p) => !p)} style={secondaryButtonStyle}>Clone Repository</button>
      </div>
      {showClone && (
        <>
          <form onSubmit={(e) => void handleCloneSubmit(e)} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="git@github.com:user/repo.git"
              autoFocus
              disabled={cloningProject}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                outline: 'none',
                width: 320,
                opacity: cloningProject ? 0.6 : 1,
              }}
            />
            <button
              type="submit"
              disabled={!cloneUrl.trim() || cloningProject}
              style={{ ...buttonStyle, opacity: !cloneUrl.trim() || cloningProject ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {cloningProject && <span className="spinner" />}
              {cloningProject ? 'Cloning...' : 'Clone'}
            </button>
          </form>
          {createError && showClone && (
            <div style={{ fontSize: 12, color: 'var(--error, #f44)', maxWidth: 480 }}>{createError}</div>
          )}
        </>
      )}
    </>
  )
}
```

Design notes for the reviewer:

- The heading + form are wrapped in a `gap: var(--space-lg)` column to match the agent hero's rhythm (`OnboardingView.tsx:127`); the divider and repo buttons stay as separate fragment children so `OnboardingView`'s `gap: var(--space-xl)` spacing still applies to them.
- `modeToggleStyles` / `startButtonStyle` come from `src/renderer/components/modals/NewAgentForm.styles.ts` — shared with `NewAgentModePill`. The pill markup is intentionally local (the spec rules `NewAgentForm` out of scope, so no generalization of `NewAgentModePill`).
- The clone form, divider, and secondary buttons are byte-identical to the current file (surgical-change rule).
- File stays ~280 LOC. If a later edit pushes it past 300, extract the style constants to `NoProjectActions.styles.ts`.

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npm test -- src/renderer/components/sidebar/NoProjectActions.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 3.5: Typecheck against baseline**

Run: `npm run typecheck:web 2>&1 | grep -c "error TS"`
Expected: same count as Task 0 baseline (≈37). New errors in `NoProjectActions.tsx` = fix before continuing.

- [ ] **Step 3.6: Commit**

```bash
git add src/renderer/components/sidebar/NoProjectActions.tsx src/renderer/components/sidebar/NoProjectActions.test.tsx
git commit -m "feat(design): single-phase start-project form with mode pill and metallic CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Docs wiki check

**Files:**
- Possibly modify: `docs/architecture/renderer.md` (covers `src/renderer`)

- [ ] **Step 4.1: Run the wiki lint**

Run: `bash scripts/wiki-lint.sh`
Expected: pass. `renderer.md` is the covering page for `src/renderer`; its claims about this area (`OnboardingView` at line 41, `fileTree` at line 62, theme loading at line 112) are orientation-level and remain true after this change. No page covers `src/shared/themes`, so the adapter change has no doc obligation.

- [ ] **Step 4.2: If the lint flags `renderer.md`**

Bump its `updated:` frontmatter to today's date and re-run the lint. Only edit claims if one actually references the old two-phase start-project flow (none did at planning time). Commit any doc change:

```bash
git add docs/architecture/renderer.md
git commit -m "docs(wiki): refresh renderer page after start-project view rework

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none modified.

- [ ] **Step 5.1: Full test suite**

Run: `npm test 2>&1 | tail -20`
Expected: same failures as the Task 0 baseline at most (known `pdf.worker?url` local artifact); zero new failures.

- [ ] **Step 5.2: Typecheck both configs**

Run: `npm run typecheck:web 2>&1 | grep -c "error TS"; npm run typecheck:node 2>&1 | grep -c "error TS"`
Expected: baseline counts from Task 0 (≈37 / ≈12), no new errors.

- [ ] **Step 5.3: Verify in the running app**

Launch the app and check (use the `verify` skill / Electron verify driver if running as an agent — strip `ELECTRON_RENDERER_URL` from the env before launching):

1. **Start-project view** (workspace → new project): serif "Start a *new project*" heading with italic accent emphasis; textarea visible immediately with "Paste the copied project instructions..." placeholder; pill switches placeholder; metallic full-width "Start Project" CTA disabled until text is entered; divider + repo buttons unchanged below.
2. **Side-by-side coherence**: open the new-agent view for an existing project and compare — heading style, pill, and CTA should read as the same family.
3. **Tree icon tint** (Royal Dark): open a project, open a `.ts` file — its tree icon renders gold-tinted with the lettermark still visible; all other icons stay monochrome; hover on other rows stays monochrome.
4. **Theme sweep**: switch to one light theme and one non-gold dark theme — active icon tints toward each theme's accent, never stays stuck on gold. If the tint looks washed out or garish on some theme, adjust the `saturate` clamp (`0.4`–`3`) or `brightness(1.08)` factor in `adapter.ts:~204` and update the two expected strings in `adapter.test.ts` to match the new formula output.

- [ ] **Step 5.4: Create the PR**

Follow the repo's PR conventions (gh-create-pr skill): meaningful branch name tied to the change, push, `gh pr create` with a body describing both parts and the spec link.

---

## Self-review (done at planning time)

- **Spec coverage:** heading (3.3), single-phase form (3.1/3.3), pill default copied (3.1), placeholder switch (3.1), `projectKind: 'folder'` only for copied (3.1), ⌘↵ preserved (3.3), clear-on-success (3.1), Go/Back removed (3.1), divider/secondaries untouched (3.3), adapter token (1.x), theme.css consumer with fallback (2.1), hover/selected untouched (2.1), tests (1.1, 3.1), tuning escape hatch (5.3), docs (4.x). ✓
- **Placeholder scan:** none — every code step shows full code; every run step has a command + expected output. ✓
- **Type consistency:** `hexToHsl` defined in 1.3 and imported in 1.4; `PromptMode` union unchanged from current code; `modeToggleStyles`/`startButtonStyle` imports match `NewAgentForm.styles.ts` exports verified at planning time. ✓
