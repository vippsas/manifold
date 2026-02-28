# Unified Dashboard Design — Merge App Cards + Create Form

**Date:** 2026-02-28
**Branch:** manifold/app-cards-view

## Goal

Merge the simple view's Dashboard (app cards grid) and NewAppForm (full-page create form) into one unified view. The create form becomes a prominent top section on the dashboard, with app cards flowing in a grid below.

## Current State

- `Dashboard.tsx` — card grid with "New App" button in header
- `NewAppForm.tsx` — full-page form navigated to via `{ kind: 'new-app' }` view state
- `App.tsx` — three view states: `dashboard`, `new-app`, `app`

## Design

### Layout

```
┌─────────────────────────────────────────┐
│  ┌─────────────────────────────────────┐│
│  │  Create a New App                   ││
│  │  [React][TS][Vite][Dexie][CSS]      ││
│  │  Name: ___________   Desc: _______ ││
│  │                          [Start]    ││
│  └─────────────────────────────────────┘│
│                                         │
│  My Apps                                │
│  ┌─────────────┐  ┌─────────────┐       │
│  │  App One    │  │  App Two    │       │
│  │  Description│  │  Description│       │
│  │  ● Building │  │  ● Live     │       │
│  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────┘
```

### Create Section (top)
- Card-like box: `background: var(--surface)`, `border: 1px solid var(--border)`, `borderRadius: var(--radius)`, `padding: 24px`
- Title "Create a new app" with tech stack icons on a row below
- Horizontal row: name input (~30%), description input (flex: 1), "Start Building" button
- Loading state: spinner in button, inputs disabled
- No Cancel button needed — form is always visible

### App Grid (below)
- "My Apps" heading shown only when `apps.length > 0`
- Same card grid as today (`repeat(auto-fill, minmax(280px, 1fr))`)
- No empty state needed — the create form is always visible above

### View State Changes
- `View` type: `{ kind: 'dashboard' } | { kind: 'app'; app: SimpleApp }` (remove `new-app`)
- Remove `onNewApp` prop from Dashboard
- Add `onStart: (name: string, description: string) => void` prop

### Files to Change
1. **`Dashboard.tsx`** — Embed create form at top, remove "New App" button, add `onStart` prop
2. **`Dashboard.styles.ts`** — Add create section styles, remove `newButton`/`emptyState`
3. **`App.tsx`** — Remove `new-app` view state, move `onStart` logic into Dashboard props, remove NewAppForm import
4. **Delete `NewAppForm.tsx`** — No longer needed
5. **Delete `NewAppForm.styles.ts`** — No longer needed

### Components to Inline
- `Spinner` — move into Dashboard (or shared utils)
- `TechIcon` — move into Dashboard
- `techStackIcons` import stays
