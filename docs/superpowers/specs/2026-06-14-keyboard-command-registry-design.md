# Keyboard command registry + command palette + shortcuts cheat-sheet

Design for the first deliverable of issue #721 ("Add keyboard shortcuts for almost
every feature"). This is the **foundation** PR. Per-feature long-tail coverage and
user-customizable keybindings are explicitly deferred to follow-up PRs.

## Goal

A single source of truth for `command → keybinding`, consumed by **both** the native
menu and the renderer, plus two discoverability surfaces:

1. A **command palette** (`Cmd+Shift+P`) that lists and runs *actions* (distinct from
   the `Cmd+P` file Quick Open).
2. A **shortcuts cheat-sheet** overlay (`Cmd+Shift+/`) and a read-only **Settings tab**
   listing the active bindings.

Today every shortcut is wired in three places (menu accelerator in `app-menu.ts`, a
preload channel whitelist, and an ad-hoc `window.electronAPI.on(...)` handler). This
collapses that to *one catalog entry + one handler-map entry*.

## Architecture (Approach A — catalog-driven native menu + one IPC channel)

```
src/shared/commands/catalog.ts        COMMANDS: CommandDef[]   (pure data, no run())
            └─ imported by ─┐
   main: app-menu.ts        │   builds menu items from COMMANDS; click → send('command:run', id)
   renderer: useCommands.ts ┘   Map<CommandId,()=>void>; on('command:run') → runCommand(id)
   renderer: CommandPalette / ShortcutsCheatSheet / Settings tab   read COMMANDS for display
```

- The command **metadata** (id, title, category, accelerator, menu placement) is static
  data in `src/shared/commands/` — importable by main, renderer, and tests.
- The **`run()` logic lives only in the renderer**, because every action calls a function
  that already exists in `App.tsx`'s assembled state (`dockState`, `overlays`,
  `appEffects`, `dockLayout`, `toggleTheme`, `jumpToFavorite`, …). We do **not** add new
  feature logic; we wire existing functions.
- **Dispatch is uniform:** the native menu owns the accelerator. Pressing the key (or
  clicking the menu item) fires the menu item's `click` → `send('command:run', id)`. The
  renderer's `useCommands` receives it and runs the handler. The command palette calls the
  same `runCommand(id)` directly. There is **no renderer global-keydown dispatcher** — we
  rely on native menu accelerators (which already work reliably over the embedded
  xterm/Monaco, as the current `Cmd+Alt+1..6` prove). This is the lowest-risk path.

### Why no renderer keydown dispatcher

Native menu accelerators intercept globally *before* the focused web content (Monaco,
xterm). That is a feature here (app shortcuts should work even with the terminal focused)
but it means **every bound key is stolen from the editor/terminal**. Consequences for the
keymap (see de-confliction below): we must avoid keys Monaco needs (`Cmd+/` comment
toggle, `Cmd+Shift+O` go-to-symbol, `Ctrl+G` go-to-line) and the standard Electron roles.

## Command catalog

`CommandDef`:

```ts
type CommandCategory = 'General' | 'Agents' | 'Source Control' | 'View' | 'Navigation' | 'Help'
type MenuSectionId = 'manifold' | 'edit' | 'view' | 'go' | 'agent' | 'scm' | 'help'

interface CommandDef {
  id: CommandId                 // stable string union, e.g. 'agents.next'
  title: string                 // shown in menu, palette, cheat-sheet
  category: CommandCategory     // grouping in palette + cheat-sheet
  accelerator?: string          // Electron format, e.g. 'CmdOrCtrl+Shift+P'; omitted = palette/menu-only
  menu?: { section: MenuSectionId; order: number }  // omitted = palette-only (none in this PR)
}
```

A command without an `accelerator` is still fully keyboard-reachable through the palette
(type → Enter) — matching VS Code's model where high-frequency actions get a direct key
and the long tail lives in the palette.

### Starter keymap (this PR)

Existing bindings (migrated onto the catalog — behavior unchanged):

| Command | id | Accel | Menu | Handler |
|---|---|---|---|---|
| Settings… | `general.settings` | `Cmd+,` | Manifold | `overlays.setShowSettings(true)` |
| Find in Files | `navigation.findInFiles` | `Cmd+Shift+F` | Edit | `appEffects.focusSearch('code')` |
| Toggle Projects/Agent/Editor/Files/Modified Files/Shell | `view.toggle.*` | `Cmd+Alt+1..6` | View | `dockLayout.togglePanel(id)` |
| Jump to Favorite 1..9 | `navigation.favorite.{1..9}` | `Cmd+1..9` | Go | `jumpToFavorite(i)` |
| Quick Open File… | `navigation.quickOpenFile` | `Cmd+P` | Go | `openQuickOpen()` (guards preserved) |
| About Manifold | `help.about` | — | Manifold | `overlays.setShowAbout(true)` |

New commands (reuse existing functions only):

| Command | id | Accel | Menu | Handler |
|---|---|---|---|---|
| Command Palette… | `general.commandPalette` | `Cmd+Shift+P` | Go | `overlays.setShowCommandPalette(true)` |
| Keyboard Shortcuts | `help.shortcuts` | `Cmd+Shift+/` | Help | `overlays.setShowShortcuts(true)` |
| New Agent | `agents.new` | `Cmd+N` | Agent | `overlays.handleNewAgentFromHeader()` |
| Next Agent | `agents.next` | `Cmd+Shift+]` | Agent | `cycleAgent(+1)` → `handleSelectSession` |
| Previous Agent | `agents.previous` | `Cmd+Shift+[` | Agent | `cycleAgent(-1)` → `handleSelectSession` |
| Delete Agent… | `agents.delete` | — | Agent | `requestDeleteAgent(activeSession, path)` |
| Commit… | `scm.commit` | `Cmd+Shift+C` | Source Control | `overlays.setActivePanel('commit')` |
| Create Pull Request… | `scm.createPR` | — | Source Control | `overlays.setActivePanel('pr')` |
| Focus Chat | `view.focusChat` | — | View | `onOpenModule('agent')` |
| Focus Terminal | `view.focusTerminal` | `Ctrl+`` ` `` | View | `onOpenModule('shell')` |
| Focus File Tree | `view.focusFiles` | `Cmd+Shift+E` | View | `onOpenModule('fileTree')` |
| Toggle Theme | `view.toggleTheme` | — | View | `toggleTheme()` |

Context-insensitive commands (e.g. Next Agent with no project, Commit on a non-git
project) **no-op in their handler** rather than dynamically disabling menu items — far
simpler than rebuilding the native menu on every state change, and acceptable for v1.

### De-confliction

Chosen keys avoid: Electron roles (`Cmd+R` reload, `Cmd+Shift+R` force-reload,
`Ctrl+Cmd+F` fullscreen, `Cmd+0/=/-` zoom, `Cmd+W/M/H/Q`), Monaco bindings (`Cmd+/`,
`Cmd+Shift+O`, `Ctrl+G`), and all existing app bindings. **Note:** the issue suggested
`Cmd+/` for the cheat-sheet; we use `Cmd+Shift+/` (the macOS Help convention, `Cmd+?`)
because a native `Cmd+/` accelerator would globally steal Monaco's comment-toggle.

### Deferred to follow-up PRs

Rename agent (needs an inline prompt), interrupt/stop agent (no existing renderer
function), editor tab next/prev/close (`Cmd+W` collision + editor-focus gating),
switch repo/workspace by key, in-pane search, and **user-customizable keybindings**.
The Settings tab is read-only in this PR (the comment on the issue notes editing is a
later goal).

## Components & files

New:

- `src/shared/commands/catalog.ts` — `CommandId`, `CommandDef`, `COMMANDS`, `CommandCategory`, `MenuSectionId`.
- `src/shared/commands/accelerator-label.ts` — `formatAccelerator('CmdOrCtrl+Shift+P') → '⌘⇧P'` (pure).
- `src/renderer/commands/command-handlers.ts` — `createCommandHandlers(ctx): Record<CommandId, () => void>` (pure-ish; testable with a mock ctx).
- `src/renderer/commands/agent-cycle.ts` — `cycleAgent(sessions, activeId, dir): AgentSession | null` (pure).
- `src/renderer/hooks/useCommands.ts` — memoizes handlers, subscribes `command:run`, returns `runCommand`.
- `src/renderer/components/command-palette/CommandPalette.tsx` — palette UI (reuses `createDialogStyles` + `fuzzyFilter`).
- `src/renderer/components/command-palette/ShortcutList.tsx` — shared grouped list of commands + formatted accelerators.
- `src/renderer/components/command-palette/ShortcutsCheatSheet.tsx` — overlay wrapper around `ShortcutList`.
- `src/renderer/components/modals/settings/ShortcutsSettingsSection.tsx` — Settings tab wrapper around `ShortcutList`.

Modified:

- `src/main/app/app-menu.ts` — generate accelerator menu items from `COMMANDS` grouped by `menu.section`; click → `send('command:run', id)`. Keep bespoke items (What's New, Check for Updates, Keep Mac Awake) and standard roles.
- `src/preload/index.ts` — add `command:run` to `ALLOWED_LISTEN_CHANNELS`; remove the now-unused migrated channels (`show-settings`, `show-about`, `view:toggle-panel`, `view:show-search`, `view:jump-favorite`).
- `src/renderer/hooks/useAppEffects.ts` — drop the three migrated `on(...)` effects; keep `focusSearch` (still used elsewhere).
- `src/renderer/hooks/useAppOverlays.ts` — drop the two migrated `on(...)` effects; add `showCommandPalette` / `showShortcuts` state + setters.
- `src/renderer/App.tsx` — remove the bespoke `Cmd+P` keydown; add `openQuickOpen()` (with the existing guards); build a `commandContext`; call `useCommands`; pass `runCommand` + palette/cheat-sheet visibility to `AppShell`.
- `src/renderer/AppShell.tsx` — mount `<CommandPalette>` and `<ShortcutsCheatSheet>`.
- `src/renderer/components/modals/settings/SettingsModalBody.tsx` — add the `shortcuts` tab.
- `docs/architecture/app.md` — document the catalog-driven menu (covers `src/main/app`); bump `updated:`.

Every new/modified file stays under the 300-LOC project limit.

## Data flow

```
key press / menu click
   → Electron menu item click  (main, app-menu.ts)
   → webContents.send('command:run', id)
   → preload (whitelisted) → window.electronAPI.on('command:run')  (renderer, useCommands)
   → runCommand(id) → handlers[id]()  → existing App.tsx function

command palette Enter
   → CommandPalette onRun(id) → runCommand(id) → handlers[id]()
```

## Error handling

- `runCommand(unknownId)` logs a `console.warn` and no-ops (forward-compat if main and
  renderer catalogs ever skew across an update).
- Handlers that need context (active session/project) guard internally and no-op.
- `openQuickOpen()` preserves today's guards: no-op when there's no session or when an
  `[role=dialog][aria-modal=true]` already owns the screen.

## Testing (TDD)

Pure units, written first:

- `accelerator-label.test.ts` — symbol mapping (`Cmd`,`Shift`,`Alt`,`Ctrl`,`Enter`,arrows), ordering, `CmdOrCtrl`→`⌘`.
- `agent-cycle.test.ts` — forward/back wraparound, null active → first, single session, empty list.
- `catalog.test.ts` — ids unique; **no two commands share an accelerator**; every command has title+category; menu sections valid.
- `command-handlers.test.ts` — `createCommandHandlers(mockCtx)` maps each id to the right ctx call (e.g. `agents.next` → `ctx.nextAgent`); unknown ids absent.
- `app-menu.test.ts` (extend) — every `COMMANDS` accelerator appears in the built template; clicking a catalog item sends `command:run` with its id; destroyed-window guard still holds.

Component test:

- `CommandPalette.test.tsx` — renders commands, filters on type, `Enter` calls `onRun` with the highlighted id, `Escape` closes.

Verification gate: `npm run typecheck:web`, `npm run typecheck:node`, the new + existing
vitest suites, and `bash scripts/wiki-lint.sh`.
