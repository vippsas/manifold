# Plugin icons in the activity bar

**Date:** 2026-08-09
**Status:** Approved design

## Problem

Enabled plugins have no presence in the workbench chrome. To reach one you either open
the active agent's gear → Apps list (Loop, Watch) or the Dashboard overlay (Statistics,
Worktrees). Neither is discoverable, and the split means two enabled plugins are reachable
only from a surface that has nothing to do with plugins.

The activity rail already answers "what can I open?" for the built-in surfaces. Enabled
plugins belong there too.

## Goal

Every enabled plugin that contributes a view gets an icon in the activity rail, in a third
group separated from the built-in icons. Clicking an icon toggles that plugin's panel in
the main dock area — the same behaviour as the Agent/Editor/Shell icons directly above it.

## Decisions

Settled during brainstorming; recorded so the plan doesn't relitigate them.

| Question | Decision | Why |
| --- | --- | --- |
| What does a click do? | Toggle the plugin's panel in the main dock area | Consistent with the icons directly above it; reuses `openPluginView`/`openPluginTreeView`; works for all four plugins |
| Which plugins appear? | Every enabled plugin with a view contribution — the `launcher` flag is ignored by the rail | "Enabled plugins as icons" should mean exactly that. `launcher` keeps its existing, narrower meaning: whether the view appears in the agent Apps list |
| Where do icons come from? | A new optional `icon` field on the view manifest, naming one of a closed set the host ships | Glyphs stay in-house, so they match the rail's 18px / 1.6-stroke / `currentColor` style. Arbitrary plugin-supplied SVG was rejected: it can't match the surrounding stroke weight and adds a sanitization surface |

Explicitly out of scope: the Dashboard overlay is untouched. The rail is an added route to
Statistics and Worktrees, not a replacement for their Dashboard cards.

## Design

### 1. Icon names travel from manifest to renderer

A new shared module holds the closed set, so the main-process parser and the renderer
glyph table cannot drift:

```ts
// src/shared/plugins/icons.ts (new)
export const PLUGIN_ICON_IDS = ['chart', 'branch', 'loop', 'video', 'plugin'] as const
export type PluginIconId = typeof PLUGIN_ICON_IDS[number]
export function isPluginIconId(value: unknown): value is PluginIconId
```

Five names: four for the bundled plugins plus `plugin` (a puzzle piece) as the fallback for
any view that declares no icon or an unrecognised one. The set grows when a plugin needs a
name, not before.

The field threads through the four places a view contribution is described today:

| File | Change |
| --- | --- |
| `src/shared/plugins/manifest.ts:19` | `PluginViewContribution` gains `icon?: PluginIconId` |
| `src/main/plugins/manifest.ts:84` | Parser reads `view.icon`, keeps it only when `isPluginIconId`; an unrecognised name is **dropped, not a manifest error** |
| `src/shared/plugins/contributions.ts:17` | `PanelContribution` gains `icon?: PluginIconId` |
| `src/main/plugins/plugin-manager.ts:39` | `viewContributionsOf` passes `icon` through |

Dropping rather than rejecting an unknown name means a plugin built against a newer host
still loads on an older one — it just falls back to the generic glyph.

The four bundled manifests under `resources/plugins/` declare their icon:

| Plugin | View | `icon` |
| --- | --- | --- |
| `manifold.statistics` | `manifold.statistics.panel` | `chart` |
| `manifold.worktrees` | `manifold.worktrees.panel` | `branch` |
| `manifold.loop` | `manifold.loop.panel` | `loop` |
| `manifold.watch` | `manifold.watch.panel` | `video` |

SVG paths live renderer-side in a new `src/renderer/components/plugin-glyphs.tsx`, drawn
the way `PANEL_GLYPH_PATHS` (`src/renderer/components/ActivityBar.tsx:29`) is — 24 viewBox,
1.6 stroke, `currentColor`, 18px in the rail — so a plugin icon is indistinguishable in
weight and theming from a built-in one.

### 2. A third rail group

`ActivityBar` renders a third group after a second `activityBarStyles.divider`, below the
Agent/Editor/Shell toggles and above the settings spacer.

The group is its own component, `PluginRailGroup`, in its own file: `ActivityBar.tsx` is
already 201 LOC and the project caps a touched file at 300, and the group has enough
behaviour of its own to deserve a separate test.

It reads a new hook alongside the existing one:

```ts
// src/renderer/plugins/use-contributions.ts
export function usePluginContributions(): RegisteredPanel[]
```

backed by a new `getPluginContributions()` in `contribution-registry.ts` that filters
`source === 'plugin'` with **no** `launcher` filter. The registry is a module-level
singleton with its own subscriber set, so the hook works even though `ActivityBar` renders
outside `DockStateContext.Provider` (`src/renderer/AppShell.tsx:158`).

One icon per view contribution, in registration order. A plugin contributing two views gets
two icons — the rail is a list of openable views, matching what the panel ids are.

With zero enabled plugin views, the group renders nothing **and** the divider is omitted:
a separator above empty space would read as a rendering bug.

### 3. Toggle semantics

| Interaction | Call |
| --- | --- |
| Icon of a closed view | `onOpenPluginView(id, title)`, or `onOpenPluginTreeView(id, title)` when `kind === 'tree'` |
| Icon of an open view | `onClosePanel(id)` |
| Active marking | `isPanelVisible(id)` |

`isPanelVisible` is already id-agnostic in its implementation — `api.getPanel(id) !== undefined`
(`src/renderer/hooks/dock-layout/dock-layout-actions.ts:119`) — so only its `DockPanelId`
parameter type widens to `string`. No behavioural change to the existing callers.

`AppShell` assembles these from `p.dockState` and `p.dockLayout` and passes one `pluginRail`
prop bundle to `ActivityBar`, keeping the rail free of context dependencies it cannot reach.

Active state stays fresh through the same mechanism the Agent/Editor/Shell icons use: dock
mutations call `bumpVersion()`, which re-renders the tree that owns the rail.

### 4. Empty-dock robustness

`openPluginView` positions the new panel relative to `'agent'` when no editor is open
(`src/renderer/hooks/dock-layout/useDockLayout.ts:216`), and dockview throws when the named
`referencePanel` does not exist.

Until now every route into `openPluginView` ran from the active agent's settings modal, so
an agent panel was always present. The rail makes "no agent panel in the dock" reachable for
the first time, so `openPluginView` falls back to a bare `api.addPanel({ id, component, title })`
with no `position` when the resolved reference panel is absent. Same fallback in
`openPluginTreeView`.

This is the one pre-existing-code change the feature requires; it is in scope because the
feature is what makes the path reachable.

### 5. No session gating

Statistics and Worktrees are global surfaces with no reason to require an agent, so the
plugin group carries no equivalent of `PanelRailItem.sessionOnly`. Loop and Watch are
agent-scoped in their own behaviour, but that is the plugin's concern to report, not the
rail's to pre-empt.

### 6. Accessibility and affordance

Each button matches the existing rail items exactly: `aria-label={title}`,
`aria-pressed={isOpen}`, the `.activity-bar-item--active` class when open, and the hover
`.activity-bar-tooltip` span carrying the view title.

## Verification

Done means all of the following, run and observed — not inferred from the diff.

**Unit**
- Manifest parser: a valid `icon` survives; an unrecognised `icon` is dropped and the
  manifest still parses; a missing `icon` stays `undefined`.
- `viewContributionsOf` carries `icon` through to the renderer contribution.
- `getPluginContributions()` returns `launcher: false` plugin views and excludes internal
  contributions.
- `PluginRailGroup`: one button per enabled plugin view; click on a closed view opens it
  (tree views via the tree path); click on an open view closes it; `aria-pressed` tracks
  open state; a view with no icon renders the fallback glyph; an empty registry renders
  neither buttons nor a divider.

**Visual — required, not optional**
- `npm run screenshot:component ActivityBar` to confirm the third group and its separator
  sit correctly under a real theme.
- `npm run drive:app`, clicking each of the four icons in the built app, confirming each
  panel actually renders. Statistics and Worktrees have only ever been drawn full-window as
  Dashboard cards; anything that breaks at half-width dock width is fixed in this change.

**Gates**
- `npm test`
- `npm run typecheck`
- `bash scripts/wiki-lint.sh`, plus an `updated:` bump on the architecture page covering
  the plugin contribution chain and the one covering the activity bar / dock layout.
