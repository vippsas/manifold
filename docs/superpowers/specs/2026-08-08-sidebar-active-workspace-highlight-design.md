# Highlighting the Active Workspace in the Sidebar — Design

## Goal

The sidebar lists every workspace, but the one whose agent is open in the main
panel is almost indistinguishable from the rest. With four or five agents in the
list you have to read carefully to find where you are.

Give the active workspace a "you are here" marker strong enough to find at a
glance, without adding weight that scales with an expanded file tree.

## Why the current treatment is too quiet

The active card carries exactly three signals today, all of them small:

- **Label color** — `--text-primary` instead of `--text-secondary`
  (`theme.css:892`). On Royal Dark that is `#E6ECF7` against `#A7B4CC`: a real
  step, but only on text.
- **Glyph color** — `WorkspaceGlyph` goes `var(--accent)` when active
  (`WorkspaceGlyph.tsx:22`). One 14px icon.
- **Sticky header** — the active card's row pins to the top of the scroll
  container (`theme.css:920`).

There is no active surface at all, and that is deliberate: `theme.css:885`
records the decision as *"The active row carries no fill — selection is shown by
label color alone."*

Two things defeat it in practice. The accent glyph is the same hue as the
`.status-dot--active` dots on every *working* workspace (`theme.css:466-472`),
and those dots **pulse** (`core-pulse`, `theme.css:477`). A static 14px glyph
loses to three animated ones. And a `--sidebar-active-bg` token already exists
for exactly this purpose (`theme.css:135`, mapped from
`list.inactiveSelectionBackground` in `adapter.ts:172`) but nothing in the
sidebar row styles uses it.

## Decision

Mark the active card with **an accent rail plus a subtle wash**, where the rail
spans the whole card — header, repo rows, and any expanded file tree — but the
wash stops above the tree.

Three alternatives were rendered against real Royal Dark tokens before choosing:

- **Header row only.** Reads as a list selection rather than a region. Its
  specific failure: selecting a workspace auto-expands it
  (`WorkspaceCard.tsx:112-115`), so the repo row you actually click into sits
  *outside* the highlight and looks identical to every unselected row.
- **Whole card, wash included over the tree.** Turns a large block of the
  sidebar gold the moment a folder is expanded, and nests the card's hairline
  around the tree's own.
- **Whole card, wash stopping above the tree.** Chosen.

An earlier draft of this spec claimed the third option was necessary because a
wash over the tree would erase the open file's own highlight
(`.file-tree-row--active`, `theme.css:1777`, which uses the *same*
`--sidebar-active-bg` and `--sidebar-active-border` pair). **That claim is
wrong** and the mockup disproved it: alpha compositing preserves the step. On
Royal Dark the active file row lands at `rgb(24,26,31)` against a plain
`rgb(9,13,24)` sidebar — a delta of ~(15,13,7) — and at `rgb(38,38,37)` against
a washed `rgb(24,26,31)` card, a delta of ~(14,12,6). Effectively identical.

The real reason to stop the wash is **weight**: the highlight should cost the
same whether a folder is collapsed or a thousand-line tree is open.

## Implementation

CSS only, all in `src/renderer/styles/theme.css`. No component changes —
`WorkspaceCard.tsx:118` already puts `sidebar-project-group--active` on the card
when `isActive`, and `WorkspaceList.tsx:116` already derives that from
`activeWorkspaceId`.

### 1. The card becomes the highlight surface

`.sidebar-workspace-card.sidebar-project-group--active` gains `position:
relative`, `margin: 2px 8px`, and `border-radius: var(--radius-sm)`.

It must **not** get `overflow: hidden` — that would break the sticky header
inside it.

### 2. Its rows give up their own horizontal margin

`.sidebar-item-row` carries `margin: 1px 8px` (`theme.css:871`). Inside the
active card that 8px moves to the card, so rows become `margin-inline: 0`. Row
*padding* is untouched, so no label shifts horizontally — the row's text stays
exactly where it is today.

The 1px block margin stays, leaving a 1px unwashed hairline between consecutive
rows. At 7% opacity this is not visible; the mockup confirms the rows read as
one contiguous block.

### 3. The rail

A `::before` on the card: 2px wide, `var(--accent)`, `top: 0; bottom: 0; left:
0`, with the left corners rounded to `var(--radius-sm)`. It runs the card's full
height, so it continues down past an expanded file tree and keeps marking the
region the tree belongs to.

### 4. The wash

`.sidebar-workspace-card.sidebar-project-group--active > .sidebar-item-row`
gets `background: var(--sidebar-active-bg)`.

The child combinator does the scoping for free. The card's direct
`.sidebar-item-row` children are the workspace header (`WorkspaceCard.tsx:131`),
each repo row (`WorkspaceRepoRow.tsx:57`), and any draft rows
(`DraftAgentItem.tsx:35`). An expanded tree renders into
`.sidebar-project-files` (`WorkspaceRepoRow.tsx:117`), which is not a
`.sidebar-item-row` — so it is excluded without a rule of its own.

### 5. The sticky header needs the wash composited in

`theme.css:920` gives the active card's header `background: var(--bg-sidebar)`
so that rows scrolling underneath do not read through it. That background is
opaque, and it wins over the wash on the same element — the header would render
*un*highlighted while its children were washed.

It becomes the wash layered over the opaque base:

```css
background:
  linear-gradient(var(--sidebar-active-bg), var(--sidebar-active-bg)),
  var(--bg-sidebar);
```

### 6. Rows inside the active card need their own hover

`.sidebar-item-row:hover` sets `background: var(--list-hover-bg)`
(`theme.css:881`), which resolves to accent at 5% — *less* than the wash's 7%.
It also loses on specificity: `(0,2,0)` against the active card's `(0,3,0)`. So
without a rule, hovering a row in the active card would do nothing at all.

Those rows get their own hover at `var(--sidebar-active-border)` (accent at 12%,
`adapter.ts:174`) — an existing token, and an unambiguous step up from the 7%
wash.

## Verification

This worktree has no `node_modules`, so `npm run bootstrap` runs first (CLAUDE.md
§7 — a real install, not a symlink).

Per CLAUDE.md §4, seeing it is part of done:

1. `npm run screenshot:component ProjectSidebar --theme royal-dark` — confirm the
   rail, the wash, the boundary above the file tree, and that no label shifted
   horizontally against a pre-change capture.
2. Capture the same fixture with a folder expanded, to confirm the wash stops and
   the rail continues.
3. `npm test` on the sidebar suites, and `npm run typecheck`.

**No unit test is added.** The sidebar suites run in jsdom, which does not load
`theme.css`, so a test asserting computed styles would assert nothing. The
screenshots are the real gate.

## Documentation

`docs/architecture/renderer.md` covers `src/renderer` and already documents the
sidebar's glyph and label rules. It gains a short section on the active-workspace
treatment — the rail/wash split, why the wash stops above the tree, and the two
traps (the opaque sticky background, and hover losing to the wash on both
specificity and opacity) — with its `updated:` bumped, in the same PR.

## Out of scope

- Any change to `.file-tree-row--active`, or to the file tree generally.
- Any change to the working-agent status dots, their color, or their pulse.
- The `--sidebar-active-bg` / `--sidebar-active-border` token values themselves,
  or their mapping in `adapter.ts`. This design consumes them as they are.
