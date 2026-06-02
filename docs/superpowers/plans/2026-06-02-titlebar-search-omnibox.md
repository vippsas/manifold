# Title-Bar Search Omnibox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an always-visible search field to the app title bar whose results drop down in an anchored panel directly under the field (the "inline omnibox" from the mockup), surfacing the search engine Manifold already has.

**Architecture:** A new self-contained `TitleBarSearch` component lives in the title-bar center. It reuses the existing `useSearch` hook (the same `search:context` / `search:query` IPC backend the dock `SearchPanel` uses) and the existing `splitHighlightedText` util for match highlighting. Selecting a code result calls the existing `onOpenSearchResult` handler, threaded from `dockState` through `AppShell` → `TitleBar`. No main-process, IPC, or backend changes — the dock `SearchPanel` and the `Cmd+Shift+F` shortcut keep working unchanged.

**Tech Stack:** React 19 + TypeScript, Electron renderer, CSS-in-JS `.styles.ts` (the renderer's convention) plus the global `theme.css`, Vitest + @testing-library/react.

---

## Assumptions & Decisions

These were locked during brainstorming or are reasonable defaults. Correct any before/while executing.

1. **Interaction model: inline omnibox** (locked by the user). Results drop down anchored under the field; the dock `SearchPanel` remains for deep exploration.
2. **Scope chips map to the three real `SearchMode`s:** `Everything → 'everything'`, `Code → 'code'`, `Memory → 'memory'`. The mockup's 4th chip ("Sessions") is dropped — there is no `session` search mode in the backend (`SearchMode = 'code' | 'memory' | 'everything'`), so a Sessions chip would be misleading.
3. **The shortcut is unchanged.** `Cmd+Shift+F` continues to open/focus the dock `SearchPanel` (via `app-menu.ts` → `view:show-search`). The omnibox is the always-visible, **click-to-focus** entry point, satisfying "reachable without a shortcut." Wiring a dedicated accelerator to focus the omnibox is an easy follow-up but is intentionally out of scope to avoid changing existing keyboard behavior. The mockup's idle "⌘⇧F" hint is therefore **not** ported.
4. **The omnibox owns its own `useSearch` instance**, independent of the dock panel's. Quick lookups never touch the dock. Cost: one extra `search:context` IPC per project switch (queries only fire for non-empty input). Acceptable.
5. **AI ("Ask AI") is an optional final task (Task 3).** The core omnibox (Tasks 1–2) ships without it; the dock panel already provides AI answers. Task 3 adds an inline AI answer reusing `search.ask()` / `search.aiAnswer`.
6. **Memory results are not openable as files** (mirrors `SearchPanel`/`useSearchResultOpening`: only `source === 'code'` results open). Clicking/Enter on a memory result is a no-op.

## File Structure

**Create:**
- `src/renderer/components/TitleBarSearch.styles.ts` — CSS-in-JS inline styles for the omnibox (`Record<string, React.CSSProperties>`, matching the existing `TitleBar.styles.ts` pattern).
- `src/renderer/components/TitleBarSearch.tsx` — the omnibox: field + anchored dropdown + live results + keyboard nav. Owns a `useSearch` instance; reuses `splitHighlightedText`. Two small inline SVG glyphs (search, memory). Estimated ~190 LOC (under the 300-LOC ceiling).
- `src/renderer/components/TitleBarSearch.test.tsx` — Vitest behavior tests.

**Modify:**
- `src/renderer/components/TitleBar.tsx` — accept an optional `search` wiring prop; render `<TitleBarSearch>` centered; left-align the project name.
- `src/renderer/components/TitleBar.styles.ts` — layout for left project + centered search slot.
- `src/renderer/AppShell.tsx` — pass the `search` wiring (pulled from `dockState`) to the project-active `TitleBar` render.
- `src/renderer/styles/theme.css` — append one scoped `::placeholder` rule (the only thing inline styles can't express; the dropdown entrance reuses the existing `toast-slide-up` keyframe).

**Reused unchanged (do NOT modify):** `src/renderer/hooks/useSearch.ts`, `src/renderer/hooks/search-request.ts`, `src/renderer/components/search/search-highlight.ts`, `src/shared/search-types.ts`, `src/main/ipc/search-handlers.ts`, `src/main/app/app-menu.ts`, `src/preload/index.ts`.

### Key reused signatures (already exist — referenced by the code below)

```ts
// src/renderer/hooks/useSearch.ts
function useSearch(
  activeProjectId: string | null,
  activeSessionId: string | null,
  allProjectSessions?: Record<string, AgentSession[]>,
): UseSearchResult
// UseSearchResult includes: mode, setMode, query, setQuery, scopeKind, setScopeKind,
//   matchMode, caseSensitive, wholeWord, results: UnifiedSearchResult[], isSearching,
//   error, canAskAi, aiAnswer, isAsking, aiError, ask(), clearAiAnswer(), ...
// Internally debounces query input 250ms and fires search:query; empty query → no IPC, [] results.

// src/renderer/components/search/search-highlight.ts
function splitHighlightedText(
  text: string,
  options: { query: string; matchMode: SearchMatchMode; caseSensitive: boolean; wholeWord: boolean },
): { text: string; match: boolean }[]

// src/shared/search-types.ts
type SearchMode = 'code' | 'memory' | 'everything'
interface CodeSearchResult   { source: 'code';   id; title; snippet; filePath; relativePath; line; column?; sessionId?; ... }
interface MemorySearchResultItem { source: 'memory'; id; title; snippet; memorySource: 'observation'|'session_summary'|'interaction'; createdAt; ... }
type UnifiedSearchResult = CodeSearchResult | MemorySearchResultItem

// dockState (src/renderer/components/editor/dock-panel-types.ts) — threaded through AppShell:
onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
activeProjectId: string | null
sessionId: string | null
allProjectSessions: Record<string, AgentSession[]>
```

---

## Task 1: Build the `TitleBarSearch` omnibox (standalone)

Build the component, its styles, and its tests in isolation — no title-bar integration yet.

**Files:**
- Create: `src/renderer/components/TitleBarSearch.styles.ts`
- Create: `src/renderer/components/TitleBarSearch.tsx`
- Test: `src/renderer/components/TitleBarSearch.test.tsx`

- [ ] **Step 1: Create the styles file**

Create `src/renderer/components/TitleBarSearch.styles.ts`:

```ts
import type React from 'react'

export const titleBarSearchStyles: Record<string, React.CSSProperties> = {
  wrap: {
    // @ts-expect-error -- Electron-specific CSS property; opt out of window drag
    WebkitAppRegion: 'no-drag',
    position: 'relative',
    width: 'min(440px, 46%)',
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    height: 28,
    padding: '0 var(--space-sm) 0 var(--space-md)',
    background: 'var(--bg-input)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-pill)',
    color: 'var(--text-muted)',
    transition: 'border-color 150ms ease, box-shadow 150ms ease, color 150ms ease',
  },
  fieldFocused: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle)',
    color: 'var(--accent)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--type-ui-small)',
  },
  iconWrap: {
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  clearBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    background: 'var(--bg-overlay)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-overlay)',
    overflow: 'hidden',
    zIndex: 50,
    animation: 'toast-slide-up 160ms ease',
  },
  scopes: {
    display: 'flex',
    gap: 6,
    padding: 'var(--space-sm) var(--space-md)',
    borderBottom: '1px solid var(--divider)',
  },
  scope: {
    fontSize: 'var(--type-ui-caption)',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--control-border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  scopeActive: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  results: {
    maxHeight: 320,
    overflowY: 'auto',
    padding: 'var(--space-xs)',
  },
  groupLabel: {
    fontSize: 'var(--type-ui-micro)',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: 'var(--text-muted)',
    padding: '6px 10px 3px',
  },
  empty: {
    padding: '14px 10px',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
  },
  errorText: {
    padding: '14px 10px',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--error)',
  },
  result: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease',
  },
  resultActive: {
    background: 'var(--list-hover-bg)',
    color: 'var(--text-primary)',
  },
  resultIcon: {
    color: 'var(--text-muted)',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  resultBody: {
    minWidth: 0,
    flex: 1,
  },
  resultTitle: {
    fontSize: 'var(--type-ui-small)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  resultMeta: {
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mark: {
    color: 'var(--accent)',
    background: 'var(--accent-subtle)',
    borderRadius: 'var(--radius-xs)',
    padding: '0 1px',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-md)',
    padding: 'var(--space-sm) var(--space-md)',
    borderTop: '1px solid var(--divider)',
    background: 'var(--bg-chrome)',
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
  },
  fkbd: {
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '1px 5px',
    marginRight: 4,
  },
}
```

- [ ] **Step 2: Write the failing test file**

Create `src/renderer/components/TitleBarSearch.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'
import { installElectronApi, mockInvoke } from '../hooks/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

function makeWiring(overrides: Partial<TitleBarSearchWiring> = {}): TitleBarSearchWiring {
  return {
    activeProjectId: 'project-1',
    activeSessionId: 'session-1',
    allProjectSessions: {},
    onOpenSearchResult: vi.fn(),
    ...overrides,
  }
}

const CODE_RESULT = {
  id: 'r1',
  source: 'code' as const,
  title: 'executeSearchQuery',
  snippet: 'export async function executeSearchQuery(req) {',
  filePath: '/abs/src/main/search/search-query-service.ts',
  rootPath: '/abs',
  relativePath: 'src/main/search/search-query-service.ts',
  line: 14,
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  installElectronApi()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
    if (channel === 'search:context') {
      return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
    }
    if (channel === 'search:query') {
      return Promise.resolve({ results: [CODE_RESULT], total: 1, tookMs: 3 })
    }
    return Promise.reject(new Error(`Unexpected channel: ${channel}`))
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TitleBarSearch', () => {
  it('renders an always-visible search field', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    expect(screen.getByLabelText('Search code and memory')).toBeInTheDocument()
  })

  it('opens the dropdown with scope chips on focus', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    fireEvent.focus(screen.getByLabelText('Search code and memory'))
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Code' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Memory' })).toBeInTheDocument()
  })

  it('closes the dropdown on Escape', () => {
    render(<TitleBarSearch search={makeWiring()} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Everything' })).not.toBeInTheDocument()
  })

  it('shows live results and opens the selected code result on Enter', async () => {
    const wiring = makeWiring()
    render(<TitleBarSearch search={wiring} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'execute' } })

    await flush()                      // flush search:context effect
    act(() => { vi.advanceTimersByTime(250) }) // fire the debounced search:query
    await flush()                      // flush the query response into state

    // Assert on the meta line (a single text node — the title is split across <mark> nodes).
    expect(screen.getByText('src/main/search/search-query-service.ts:14')).toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(wiring.onOpenSearchResult).toHaveBeenCalledWith({
      path: '/abs/src/main/search/search-query-service.ts',
      line: 14,
      column: undefined,
      sessionId: undefined,
    })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/renderer/components/TitleBarSearch.test.tsx`
Expected: FAIL — `Failed to resolve import "./TitleBarSearch"` (the component does not exist yet).

- [ ] **Step 4: Create the component**

Create `src/renderer/components/TitleBarSearch.tsx`:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSession } from '../../shared/types'
import type { SearchMode, UnifiedSearchResult } from '../../shared/search-types'
import { useSearch } from '../hooks/useSearch'
import { splitHighlightedText } from './search/search-highlight'
import { titleBarSearchStyles as styles } from './TitleBarSearch.styles'

export interface TitleBarSearchWiring {
  activeProjectId: string | null
  activeSessionId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  onOpenSearchResult: (target: { path: string; line?: number; column?: number; sessionId?: string | null }) => void
}

const SCOPES: { label: string; mode: SearchMode }[] = [
  { label: 'Everything', mode: 'everything' },
  { label: 'Code', mode: 'code' },
  { label: 'Memory', mode: 'memory' },
]

function SearchGlyph({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx={11} cy={11} r={7} />
      <line x1={21} y1={21} x2={16.65} y2={16.65} />
    </svg>
  )
}

function MemoryGlyph({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x={4} y={4} width={16} height={16} rx={2} />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  )
}

function metaFor(result: UnifiedSearchResult): string {
  if (result.source === 'code') return `${result.relativePath}:${result.line}`
  return `memory · ${result.memorySource.replace(/_/g, ' ')}`
}

export function TitleBarSearch({ search: wiring }: { search: TitleBarSearchWiring }): React.JSX.Element {
  const search = useSearch(wiring.activeProjectId, wiring.activeSessionId, wiring.allProjectSessions)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const codeResults = useMemo(() => search.results.filter((r) => r.source === 'code'), [search.results])
  const memoryResults = useMemo(() => search.results.filter((r) => r.source === 'memory'), [search.results])
  const ordered = useMemo(() => [...codeResults, ...memoryResults], [codeResults, memoryResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [search.results])

  const trimmedQuery = search.query.trim()

  const openResult = (result: UnifiedSearchResult | undefined): void => {
    if (!result || result.source !== 'code') return
    wiring.onOpenSearchResult({
      path: result.filePath,
      line: result.line,
      column: result.column,
      sessionId: result.sessionId,
    })
    setFocused(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setFocused(false)
      inputRef.current?.blur()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, ordered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openResult(ordered[activeIndex])
    }
  }

  const renderTitle = (text: string): React.ReactNode => {
    const segments = splitHighlightedText(text, {
      query: search.query,
      matchMode: search.matchMode,
      caseSensitive: search.caseSensitive,
      wholeWord: search.wholeWord,
    })
    return segments.map((segment, index) =>
      segment.match
        ? <mark key={index} style={styles.mark}>{segment.text}</mark>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>,
    )
  }

  const renderResult = (result: UnifiedSearchResult, index: number): React.JSX.Element => (
    <div
      key={result.id}
      style={{ ...styles.result, ...(index === activeIndex ? styles.resultActive : undefined) }}
      onMouseEnter={() => setActiveIndex(index)}
      onMouseDown={(event) => {
        event.preventDefault()
        openResult(result)
      }}
    >
      <span style={styles.resultIcon}>{result.source === 'memory' ? <MemoryGlyph /> : <SearchGlyph />}</span>
      <div style={styles.resultBody}>
        <div style={styles.resultTitle}>{renderTitle(result.title)}</div>
        <div style={styles.resultMeta}>{metaFor(result)}</div>
      </div>
    </div>
  )

  return (
    <div style={styles.wrap} ref={wrapRef}>
      <div style={{ ...styles.field, ...(focused ? styles.fieldFocused : undefined) }}>
        <span style={styles.iconWrap}><SearchGlyph size={14} /></span>
        <input
          ref={inputRef}
          className="titlebar-search-input"
          style={styles.input}
          placeholder="Search code &amp; memory…"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          aria-label="Search code and memory"
        />
        {search.query && (
          <button
            style={styles.clearBtn}
            aria-label="Clear search"
            onMouseDown={(event) => {
              event.preventDefault()
              search.setQuery('')
            }}
          >
            ✕
          </button>
        )}
      </div>

      {focused && (
        <div style={styles.dropdown}>
          <div style={styles.scopes}>
            {SCOPES.map((option) => (
              <button
                key={option.mode}
                style={{ ...styles.scope, ...(search.mode === option.mode ? styles.scopeActive : undefined) }}
                onMouseDown={(event) => {
                  event.preventDefault()
                  search.setMode(option.mode)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div style={styles.results}>
            {search.error ? (
              <div style={styles.errorText}>{search.error}</div>
            ) : !trimmedQuery ? (
              <div style={styles.empty}>Type to search code and memory.</div>
            ) : search.isSearching && ordered.length === 0 ? (
              <div style={styles.empty}>Searching…</div>
            ) : ordered.length === 0 ? (
              <div style={styles.empty}>No matches for &ldquo;{trimmedQuery}&rdquo;.</div>
            ) : (
              <>
                {codeResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Code</div>
                    {codeResults.map((result) => renderResult(result, ordered.indexOf(result)))}
                  </div>
                )}
                {memoryResults.length > 0 && (
                  <div>
                    <div style={styles.groupLabel}>Memory</div>
                    {memoryResults.map((result) => renderResult(result, ordered.indexOf(result)))}
                  </div>
                )}
              </>
            )}
          </div>

          <div style={styles.footer}>
            <span><span style={styles.fkbd}>↑↓</span>navigate</span>
            <span><span style={styles.fkbd}>⏎</span>open</span>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/TitleBarSearch.test.tsx`
Expected: PASS (4 tests).

If the "live results" test is flaky on timing, add one more `await flush()` after `advanceTimersByTime(250)` — the debounced `search()` resolves a promise that must settle before React commits the results.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/TitleBarSearch.tsx src/renderer/components/TitleBarSearch.styles.ts src/renderer/components/TitleBarSearch.test.tsx
git commit -m "feat(search): add title-bar search omnibox component"
```

---

## Task 2: Integrate the omnibox into the title bar

Render the omnibox in `TitleBar`, thread the wiring from `AppShell`, and add the one global style rule.

**Files:**
- Modify: `src/renderer/components/TitleBar.styles.ts`
- Modify: `src/renderer/components/TitleBar.tsx`
- Modify: `src/renderer/AppShell.tsx:126`
- Modify: `src/renderer/styles/theme.css` (append)
- Test: `src/renderer/components/TitleBar.test.tsx` (existing — must stay green; add one case)

- [ ] **Step 1: Add the `::placeholder` rule to `theme.css`**

Append to the end of `src/renderer/styles/theme.css`:

```css
/* ─── Title Bar Search (omnibox) ─── */
.titlebar-search-input::placeholder {
  color: var(--text-muted);
}
```

- [ ] **Step 2: Update `TitleBar.styles.ts` for left project + centered search**

Replace the `titleArea` entry and add two new keys. In `src/renderer/components/TitleBar.styles.ts`, change:

```ts
  titleArea: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 0,
  },
```

to:

```ts
  titleArea: {
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '30%',
  },
  sideSpacer: {
    flex: 1,
    minWidth: 'var(--space-md)',
  },
```

And update `titleButton.maxWidth` from `'60%'` to `'100%'` (it is now constrained by the `titleArea` `maxWidth` instead of the old centered flex area):

```ts
  titleButton: {
    // @ts-expect-error -- Electron-specific CSS property; opt out of window drag
    WebkitAppRegion: 'no-drag',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 10px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'text',
    transition: 'background 150ms ease, color 150ms ease',
  },
```

(Leave `titleInput.maxWidth` as `'60%'` — the rename input only appears in the project area and 60% of that small area is fine; no change needed there. All other keys unchanged.)

- [ ] **Step 3: Update `TitleBar.tsx` to render the omnibox**

Edit `src/renderer/components/TitleBar.tsx`. Add the import and the `search` prop, then place the omnibox between two flex spacers so it centers, with the project area on the left.

Add near the top imports:

```ts
import { TitleBarSearch, type TitleBarSearchWiring } from './TitleBarSearch'
```

Extend the props interface:

```ts
interface TitleBarProps {
  projectName?: string
  onRename?: (name: string) => void
  themeType?: 'dark' | 'light'
  onToggleTheme?: () => void
  themeFamily?: ThemeFamily
  onSelectThemeFamily?: (family: ThemeFamily) => void
  search?: TitleBarSearchWiring
}
```

Update the destructuring:

```ts
export function TitleBar({ projectName, onRename, themeType, onToggleTheme, themeFamily, onSelectThemeFamily, search }: TitleBarProps): React.JSX.Element {
```

Replace the JSX `return (...)` block so the layout becomes `[traffic] [project (left)] [spacer] [omnibox] [spacer] [themes] [toggle]`:

```tsx
  return (
    <div style={styles.container}>
      <div style={styles.trafficLightSpacer} />
      <div style={styles.titleArea}>
        {!editable ? (
          <span style={styles.title}>Manifold</span>
        ) : editing ? (
          <input
            ref={(el) => el?.select()}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            style={styles.titleInput}
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{ ...styles.titleButton, ...(hovered ? styles.titleButtonHover : undefined) }}
            title="Click to rename"
          >
            {projectName}
          </button>
        )}
      </div>
      <div style={styles.sideSpacer} />
      {search?.activeProjectId && <TitleBarSearch search={search} />}
      <div style={styles.sideSpacer} />
      {themeFamily && onSelectThemeFamily && (
        <label style={styles.themesGroup}>
          <span style={styles.themesLabel}>Themes</span>
          <select
            value={themeFamily}
            onChange={(e) => onSelectThemeFamily(e.target.value as ThemeFamily)}
            onMouseEnter={() => setThemesHovered(true)}
            onMouseLeave={() => setThemesHovered(false)}
            style={{ ...styles.themesSelect, ...(themesHovered ? styles.themesSelectHover : undefined) }}
            aria-label="Theme"
          >
            {THEME_FAMILIES.map((family) => (
              <option key={family.id} value={family.id}>
                {family.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {onToggleTheme && (
        <button
          type="button"
          onClick={onToggleTheme}
          onMouseEnter={() => setThemeHovered(true)}
          onMouseLeave={() => setThemeHovered(false)}
          style={{ ...styles.themeToggle, ...(themeHovered ? styles.themeToggleHover : undefined) }}
          title={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          aria-label={themeType === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
        >
          {themeType === 'dark' ? '☀' : '☾'}
        </button>
      )}
    </div>
  )
```

(Only the layout between the title area and the themes group changed: the old centered `titleArea` is now left-aligned, and two `sideSpacer` divs sandwich the omnibox so it centers. When `search` is absent — setup / no-project screens — the omnibox simply isn't rendered and the two spacers collapse together.)

- [ ] **Step 4: Pass the wiring from `AppShell`**

In `src/renderer/AppShell.tsx`, the project-active render at line ~126 currently is:

```tsx
      <TitleBar projectName={activeProjectName} onRename={p.onRenameActiveProject} themeType={themeType} onToggleTheme={p.onToggleTheme} themeFamily={p.themeFamily} onSelectThemeFamily={p.onSelectThemeFamily} />
```

Replace it with (adds the `search` prop sourced from `dockState`):

```tsx
      <TitleBar
        projectName={activeProjectName}
        onRename={p.onRenameActiveProject}
        themeType={themeType}
        onToggleTheme={p.onToggleTheme}
        themeFamily={p.themeFamily}
        onSelectThemeFamily={p.onSelectThemeFamily}
        search={{
          activeProjectId: p.dockState.activeProjectId,
          activeSessionId: p.dockState.sessionId,
          allProjectSessions: p.dockState.allProjectSessions,
          onOpenSearchResult: p.dockState.onOpenSearchResult,
        }}
      />
```

(The two non-project `TitleBar` renders — setup-incomplete and no-projects, at lines ~105 and ~114 — are left unchanged: no active project means no omnibox.)

- [ ] **Step 5: Add a TitleBar integration test case**

Append to the `describe('TitleBar', ...)` block in `src/renderer/components/TitleBar.test.tsx`:

```tsx
  it('renders the search omnibox when search wiring is provided', () => {
    render(
      <TitleBar
        projectName="Alpha"
        onRename={vi.fn()}
        search={{
          activeProjectId: 'project-1',
          activeSessionId: null,
          allProjectSessions: {},
          onOpenSearchResult: vi.fn(),
        }}
      />,
    )
    expect(screen.getByLabelText('Search code and memory')).toBeInTheDocument()
  })

  it('does not render the omnibox without search wiring', () => {
    render(<TitleBar projectName="Alpha" onRename={vi.fn()} />)
    expect(screen.queryByLabelText('Search code and memory')).not.toBeInTheDocument()
  })
```

Because the omnibox mounts `useSearch` (which calls `window.electronAPI.invoke`/`.on`), add the electron-API mock to this test file. At the top of `src/renderer/components/TitleBar.test.tsx`, add to the existing imports and add a `beforeEach`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installElectronApi, mockInvoke } from '../hooks/useSearch.test-helpers'
import { DEFAULT_SETTINGS } from '../../shared/defaults'

beforeEach(() => {
  installElectronApi()
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'settings:get') return Promise.resolve(DEFAULT_SETTINGS)
    if (channel === 'search:context') {
      return Promise.resolve({ projectId: 'project-1', activeSessionId: null, sessions: [] })
    }
    return Promise.resolve({ results: [], total: 0, tookMs: 0 })
  })
})
```

(The original `import { describe, it, expect, vi } from 'vitest'` line is replaced by the one above. The existing rename tests don't pass `search`, so they never mount the omnibox and are unaffected.)

- [ ] **Step 6: Run the title-bar tests**

Run: `npx vitest run src/renderer/components/TitleBar.test.tsx src/renderer/components/TitleBarSearch.test.tsx`
Expected: PASS (original 5 TitleBar tests + 2 new + 4 TitleBarSearch tests).

- [ ] **Step 7: Typecheck the renderer**

Run: `npm run typecheck:web`
Expected: No **new** errors mentioning `TitleBar.tsx`, `TitleBarSearch.tsx`, `TitleBarSearch.styles.ts`, or `AppShell.tsx`. (The renderer baseline has ~55 pre-existing type errors in unrelated test files — compare against `git stash`-clean baseline if unsure; the diff should be zero new errors.)

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/TitleBar.tsx src/renderer/components/TitleBar.styles.ts src/renderer/AppShell.tsx src/renderer/styles/theme.css src/renderer/components/TitleBar.test.tsx
git commit -m "feat(search): mount search omnibox in the title bar"
```

---

## Task 3 (Optional): Inline "Ask AI" answer

Faithful to the mockup's AI footer. The omnibox's `useSearch` already exposes `canAskAi`, `ask()`, `aiAnswer`, `isAsking`, `aiError`. This adds an Alt+Enter / click-to-ask affordance and renders the answer inline. Skip this task if shipping the core omnibox only.

**Files:**
- Modify: `src/renderer/components/TitleBarSearch.tsx`
- Modify: `src/renderer/components/TitleBarSearch.styles.ts`
- Test: `src/renderer/components/TitleBarSearch.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `describe('TitleBarSearch', ...)` in `src/renderer/components/TitleBarSearch.test.tsx`:

```tsx
  it('asks AI on Alt+Enter and renders the answer', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'settings:get') {
        return Promise.resolve({ ...DEFAULT_SETTINGS, search: { ai: { enabled: true, mode: 'answer' } } })
      }
      if (channel === 'search:context') {
        return Promise.resolve({ projectId: 'project-1', activeSessionId: 'session-1', sessions: [] })
      }
      if (channel === 'search:query') {
        return Promise.resolve({ results: [CODE_RESULT], total: 1, tookMs: 3 })
      }
      if (channel === 'search:ask') {
        return Promise.resolve({ answer: 'It runs ripgrep then merges memory hits.', citations: [], tookMs: 9 })
      }
      return Promise.reject(new Error(`Unexpected channel: ${channel}`))
    })

    render(<TitleBarSearch search={makeWiring()} />)
    const input = screen.getByLabelText('Search code and memory')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'how does search work' } })
    await flush()
    act(() => { vi.advanceTimersByTime(250) })
    await flush()

    fireEvent.keyDown(input, { key: 'Enter', altKey: true })
    await flush()

    expect(screen.getByText('It runs ripgrep then merges memory hits.')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/renderer/components/TitleBarSearch.test.tsx -t "asks AI"`
Expected: FAIL — the answer text never appears (Alt+Enter currently opens the selected result; no AI rendering).

- [ ] **Step 3: Add the AI styles**

Add to `titleBarSearchStyles` in `src/renderer/components/TitleBarSearch.styles.ts`:

```ts
  aiBlock: {
    padding: '10px var(--space-md)',
    borderBottom: '1px solid var(--divider)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-primary)',
    lineHeight: 1.5,
  },
  aiPending: {
    padding: '10px var(--space-md)',
    borderBottom: '1px solid var(--divider)',
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
  },
  aiBadge: {
    display: 'inline-block',
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    padding: '1px 6px',
    borderRadius: 'var(--radius-xs)',
    fontSize: 'var(--type-ui-micro)',
    marginRight: 6,
  },
  aiRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
  },
  aiKbd: {
    marginLeft: 'auto',
    fontFamily: 'var(--font-mono)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '1px 5px',
  },
```

- [ ] **Step 4: Wire AI into the component**

In `src/renderer/components/TitleBarSearch.tsx`:

(a) In `handleKeyDown`, handle Alt+Enter **before** the plain Enter branch:

```ts
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault()
      if (search.canAskAi && trimmedQuery) void search.ask()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      openResult(ordered[activeIndex])
    }
```

(b) Add an AI block at the top of the `<div style={styles.results}>`, before the existing error/empty/results conditionals:

```tsx
          <div style={styles.results}>
            {search.isAsking && (
              <div style={styles.aiPending}><span style={styles.aiBadge}>Ask AI</span>Thinking…</div>
            )}
            {!search.isAsking && search.aiAnswer && (
              <div style={styles.aiBlock}><span style={styles.aiBadge}>Ask AI</span>{search.aiAnswer.answer}</div>
            )}
            {!search.isAsking && search.aiError && (
              <div style={styles.errorText}>{search.aiError}</div>
            )}
            {search.error ? (
              // ...existing conditional chain unchanged...
```

(c) Replace the static footer with an AI-aware footer:

```tsx
          <div style={styles.footer}>
            {search.canAskAi && trimmedQuery ? (
              <span
                style={styles.aiRow}
                onMouseDown={(event) => {
                  event.preventDefault()
                  void search.ask()
                }}
              >
                <span style={styles.aiBadge}>Ask AI</span>
                Search &ldquo;{trimmedQuery}&rdquo; with the assistant
                <span style={styles.aiKbd}>⌥⏎</span>
              </span>
            ) : (
              <>
                <span><span style={styles.fkbd}>↑↓</span>navigate</span>
                <span><span style={styles.fkbd}>⏎</span>open</span>
              </>
            )}
          </div>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/renderer/components/TitleBarSearch.test.tsx`
Expected: PASS (all prior tests + the new "asks AI" test).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/TitleBarSearch.tsx src/renderer/components/TitleBarSearch.styles.ts src/renderer/components/TitleBarSearch.test.tsx
git commit -m "feat(search): inline Ask AI in the title-bar omnibox"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the full renderer test suite**

Run: `npm test`
Expected: PASS. (`pretest` rebuilds `better-sqlite3` for Node first — this is expected and may take a minute. If only the renderer changed, `npx vitest run src/renderer` is a faster equivalent that skips the rebuild.)

- [ ] **Step 2: Typecheck web + node**

Run: `npm run typecheck:web && npm run typecheck:node`
Expected: No new errors attributable to the changed files (compare against the pre-existing renderer baseline).

- [ ] **Step 3: Manual smoke test in the running app**

Run: `npm run dev`
Verify by observation:
1. With a project open, the rounded search field appears centered in the title bar; the project name sits to its left; Themes + theme toggle remain on the right.
2. Clicking the field opens the dropdown with the Everything / Code / Memory chips.
3. Typing a real symbol (e.g. `useSearch`) shows live, grouped, highlighted results within ~250ms.
4. Arrow keys move the highlighted row; Enter (or click) on a code result opens that file at the right line in the editor; the dropdown closes.
5. Escape and outside-click both close the dropdown.
6. `Cmd+Shift+F` still opens the dock Search panel (unchanged).
7. (If Task 3 done) With AI answer mode enabled in settings, Alt+Enter renders an inline answer.

- [ ] **Step 4: Final commit (only if Step 1–2 required fixes)**

```bash
git add -A
git commit -m "test(search): verify title-bar omnibox across suite and typecheck"
```

---

## Self-Review

**1. Spec coverage (vs. the locked decision + mockup):**
- Always-visible title-bar field → Task 2 (rendered in `TitleBar`). ✅
- Results drop down anchored under the field → `styles.dropdown` (`position: absolute; top: calc(100% + 6px)`), Task 1. ✅
- Live filtering as you type → reuses `useSearch`'s 250ms debounce + `search:query`, Task 1. ✅
- Scope chips → `SCOPES` mapped to real `SearchMode`s, Task 1 (assumption #2 drops "Sessions"). ✅
- Grouped, highlighted results → `codeResults`/`memoryResults` groups + `splitHighlightedText`, Task 1. ✅
- Keyboard navigate + open → `handleKeyDown` (Arrow/Enter/Escape) + `openResult` → existing `onOpenSearchResult`, Task 1. ✅
- Clear button, empty/searching/error states → present in Task 1. ✅
- Ask AI footer (mockup) → Task 3 (optional). ✅
- Existing dock SearchPanel + `Cmd+Shift+F` untouched → assumption #3; no main/IPC files modified. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to"/vague steps — every code step shows complete code; every run step shows the exact command and expected result. ✅

**3. Type consistency:**
- `TitleBarSearchWiring.onOpenSearchResult` signature is copied verbatim from `dockState.onOpenSearchResult` (`{ path; line?; column?; sessionId? }`), so `AppShell` can pass `p.dockState.onOpenSearchResult` with no adapter. ✅
- `openResult` passes `{ path: filePath, line, column, sessionId }` — `column`/`sessionId` are `number | undefined` / `string | undefined`, assignable to the optional target fields. ✅
- `useSearch(activeProjectId, activeSessionId, allProjectSessions)` arg order matches its definition; `search.results` is `UnifiedSearchResult[]`; the `result.source === 'code'` narrowing gives `filePath`/`relativePath`/`line`/`column`. ✅
- Component prop is `search` everywhere (`TitleBar` prop, `AppShell` pass-through, `TitleBarSearch` prop). ✅
- Style keys referenced in `.tsx` (`wrap`, `field`, `fieldFocused`, `input`, `iconWrap`, `clearBtn`, `dropdown`, `scopes`, `scope`, `scopeActive`, `results`, `groupLabel`, `empty`, `errorText`, `result`, `resultActive`, `resultIcon`, `resultBody`, `resultTitle`, `resultMeta`, `mark`, `footer`, `fkbd`; Task 3 adds `aiBlock`, `aiPending`, `aiBadge`, `aiRow`, `aiKbd`) all exist in the styles file. ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-02-titlebar-search-omnibox.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
