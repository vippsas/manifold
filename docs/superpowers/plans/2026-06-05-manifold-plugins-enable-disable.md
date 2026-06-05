# Plugin enable/disable from Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Let the user enable/disable each plugin from the **Settings → Plugins** tab. A disabled plugin is hidden from the "+ Apps" launcher and cannot be (re)activated; the choice persists across restarts. The launcher updates live when toggled.

**Architecture:** Persist a `disabledPlugins: string[]` in app settings (a plugin is enabled unless its id is listed). `PluginManager` gains `isEnabled`/`setEnabled` and filters disabled plugins out of `listViewContributions()` + guards the activation/open paths. The Settings tab lists ALL plugins with an enable/disable toggle (and shows config only for enabled plugins that contribute it). Toggling calls `plugins:set-enabled`, which persists + pushes `plugins:contributions-changed`; the renderer re-fetches contributions and re-seeds the contribution registry, so the launcher updates without a restart.

**Known limitation (documented):** because plugin *deactivation* isn't wired yet (followup I3), disabling a plugin that's already been activated this session removes it from the launcher and blocks new activation immediately, but the running instance lives until app restart. Disabling before first open takes full effect immediately. Note this in Settings copy + followups.

**Tech Stack:** existing SettingsStore (`getSettings`/`updateSettings`), the IPC + preload pattern, the contribution-registry reactivity (`resetToInternal`/`registerPanelContribution`/subscribe), React.

---

## Context (verified)

- `src/main/plugins/plugin-manager.ts` — `PluginManager(storagePath, settings: SettingsStore)`. Reads `this.settings.getSettings().pluginConfig`, writes `this.settings.updateSettings({ pluginConfig })` (the pattern to mirror). `listViewContributions()` → `viewContributionsOf(this.plugins)`; `listPlugins()` → descriptors; `activate`/`openView`/`openTreeView`/`treeGetChildren` are keyed by pluginId/viewId→plugin. Commands of a plugin only exist in the host registry AFTER activation, so guarding the open/activate paths is sufficient (a disabled plugin never activates → its commands are absent).
- `src/shared/types.ts` — `ManifoldSettings` (has `pluginConfig`). `src/shared/defaults.ts` — `DEFAULT_SETTINGS` (has `pluginConfig: {}`).
- `src/main/ipc/plugin-handlers.ts` — `plugins:list` → `pluginManager.listPlugins()`; `plugins:list-contributions` → `listViewContributions()`; `plugins:set-config` etc.
- `src/preload/index.ts` — `ALLOWED_INVOKE_CHANNELS` / `ALLOWED_LISTEN_CHANNELS`.
- `src/renderer/plugins/contribution-registry.ts` — `resetToInternal()`, `registerPanelContribution(p)`, `subscribeContributions`, `getLauncherContributions`. `src/renderer/plugins/use-contributions.ts` — `useLoadPluginContributions()` fetches `plugins:list-contributions` on mount + registers; `useLauncherContributions()` subscribes.
- `src/renderer/components/modals/settings/PluginSettingsSection.tsx` — current Plugins tab: fetches `plugins:list`, filters to plugins with `manifest.contributes.configuration`, renders config fields, writes `plugins:set-config`.

**Verification gate:** runtime tests green; typecheck node ≤16 / web ≤37 / plugins 0, none new in touched files. UI behavior → dev smoke.

---

## Task D-T1: Settings field + PluginManager enable/disable

**Files:** `src/shared/types.ts`, `src/shared/defaults.ts`, `src/main/plugins/plugin-manager.ts`, `src/main/plugins/plugin-manager.test.ts`.

- [ ] **Step 1: settings field** — in `src/shared/types.ts` add `disabledPlugins?: string[]` to `ManifoldSettings` (near `pluginConfig`). In `src/shared/defaults.ts` add `disabledPlugins: []` to `DEFAULT_SETTINGS`.

- [ ] **Step 2: failing tests** — extend `plugin-manager.test.ts`. Using the existing fake/real SettingsStore pattern in that test, add:
```typescript
it('isEnabled defaults true and setEnabled persists a disable then re-enable', () => {
  // construct a PluginManager with a settings stub whose getSettings/updateSettings back a mutable object
  expect(mgr.isEnabled('pub.a')).toBe(true)
  mgr.setEnabled('pub.a', false)
  expect(mgr.isEnabled('pub.a')).toBe(false)
  mgr.setEnabled('pub.a', true)
  expect(mgr.isEnabled('pub.a')).toBe(true)
})
it('listViewContributions hides disabled plugins', () => {
  // seed mgr.plugins with two plugins each contributing a launcher view (use the scan or set internals as the test already does)
  mgr.setEnabled('pub.b', false)
  const ids = mgr.listViewContributions().map((c) => c.pluginId)
  expect(ids).not.toContain('pub.b')
})
```
(Match how the existing `plugin-manager.test.ts` constructs the manager + a settings stub + seeds plugins. If it uses a real `SettingsStore` over a temp file, do the same.)

- [ ] **Step 3: implement** in `plugin-manager.ts`:
```typescript
isEnabled(pluginId: string): boolean {
  return !(this.settings.getSettings().disabledPlugins ?? []).includes(pluginId)
}
setEnabled(pluginId: string, enabled: boolean): void {
  const cur = this.settings.getSettings().disabledPlugins ?? []
  const next = enabled ? cur.filter((id) => id !== pluginId) : Array.from(new Set([...cur, pluginId]))
  this.settings.updateSettings({ disabledPlugins: next })
}
```
- `listViewContributions()` → `return viewContributionsOf(this.plugins.filter((p) => this.isEnabled(p.id)))`.
- Guard the open/activate paths — at the top of `activate(pluginId)`, `openView(viewId)`, `openTreeView(viewId)`, and `treeGetChildren(viewId, …)`, refuse for a disabled owner:
  - `activate`: `if (!p || !p.manifest.main || !this.isEnabled(p.id)) return`.
  - `openView`/`openTreeView`/`treeGetChildren`: after finding `plugin`, `if (!plugin || !plugin.manifest.main || !this.isEnabled(plugin.id)) return (/* [] for treeGetChildren */)`.

- [ ] **Step 4:** `npx vitest run src/main/plugins` green; `npm run typecheck:node` ≤16. Commit `feat(plugins): plugin enable/disable in PluginManager + disabledPlugins setting`.

---

## Task D-T2: IPC `plugins:set-enabled` + live contributions refresh

**Files:** `src/main/ipc/plugin-handlers.ts`, `src/preload/index.ts`, `src/renderer/plugins/use-contributions.ts`.

- [ ] **Step 1: enrich `plugins:list`** — change the `plugins:list` handler to return enabled state per plugin:
```typescript
ipcMain.handle('plugins:list', () => deps.pluginManager.listPlugins().map((p) => ({ ...p, enabled: deps.pluginManager.isEnabled(p.id) })))
```

- [ ] **Step 2: set-enabled handler** — add:
```typescript
ipcMain.handle('plugins:set-enabled', (_e, pluginId: string, enabled: boolean) => {
  deps.pluginManager.setEnabled(pluginId, enabled)
  deps.send?.('plugins:contributions-changed')  // or the same send mechanism plugin-handlers/app uses to reach the renderer
  return true
})
```
Find how main reaches the renderer from this module (the `deps` likely has a `send` or the main window). Mirror whatever `plugins:webview-html` etc. use (the `ExtensionHost.setSend` path is for the host; for plugin-handlers, use the app's main-window send — check how other handlers push to the renderer, e.g. search `webContents.send` in `src/main`). If `plugin-handlers` has no send, wire a minimal one (pass the main window's `webContents.send` into `registerPluginHandlers(deps)` like `pluginManager` is passed).

- [ ] **Step 3: preload** — add `'plugins:set-enabled'` to `ALLOWED_INVOKE_CHANNELS`; add `'plugins:contributions-changed'` to `ALLOWED_LISTEN_CHANNELS`.

- [ ] **Step 4: renderer live refresh** — in `use-contributions.ts` `useLoadPluginContributions`, after the initial fetch+register, also subscribe to `plugins:contributions-changed`: on the event, re-fetch `plugins:list-contributions`, `resetToInternal()`, then `registerPanelContribution` each — so `useLauncherContributions` subscribers (the launcher) update live. Ensure the listener is cleaned up.

- [ ] **Step 5:** `npx vitest run src/renderer src/main` green; typecheck node/web at baseline. Commit `feat(plugins): plugins:set-enabled IPC + live contributions refresh on toggle`.

---

## Task D-T3: Settings UI — enable/disable toggle

**Files:** `src/renderer/components/modals/settings/PluginSettingsSection.tsx` (+ its test if present).

- [ ] **Step 1:** Rework `PluginSettingsSection` to list **all** plugins (from the enriched `plugins:list`, which now carries `enabled` + `manifest`), each as a `SectionCard` titled by `displayName ?? id`, with:
  - an **enable/disable toggle** (a checkbox/switch) reflecting `enabled`; on change, optimistic-update local state + `invoke('plugins:set-enabled', pluginId, nextEnabled)`.
  - a one-line subtitle showing the plugin id + (if disabled) a muted "Disabled" note; include small copy that disabling hides it from "+ Apps" (and "takes full effect on restart if already running").
  - the existing **config fields** ONLY when the plugin is enabled AND has `contributes.configuration.properties` (reuse the current field-rendering for boolean/enum/number/text + `plugins:get-config`/`plugins:set-config`). Disabled or config-less plugins show just the toggle.
  - Keep the "No plugins installed" empty state.

- [ ] **Step 2:** If a `PluginSettingsSection` test exists, update it; otherwise add a light jsdom test: mock `plugins:list` returning two plugins (one enabled, one disabled, one with config), assert both render with toggles, toggling calls `plugins:set-enabled` with the right args, and config fields only show for the enabled-with-config plugin. (Mock `window.electronAPI` per existing renderer test conventions.)

- [ ] **Step 3:** `npx vitest run src/renderer` green; `npm run typecheck:web` ≤37. Commit `feat(plugins): Settings → Plugins enable/disable toggle`.

---

## Task D-T4: Build + dev smoke + followups

- [ ] **Step 1:** `npm run build`; full `npx vitest run src/main/plugins src/plugin-host src/renderer src/shared/plugins scripts` green; typechecks at baseline.
- [ ] **Step 2: dev smoke (Electron-only):** `npm run dev` → Settings → Plugins: toggle **Hello (plugin)** off → it disappears from **+ Apps** live; toggle on → it reappears; restart → the choice persisted. Record in the followups doc (+ the deactivation-on-restart limitation).
- [ ] **Step 3:** commit the followups note.

---

## Self-Review

**Spec coverage:** persisted `disabledPlugins` + manager enable/disable + contribution filtering + activation guards (D-T1); IPC toggle + live launcher refresh (D-T2); Settings toggle UI (D-T3); verify (D-T4).

**Notes/risks:** (a) Guarding open/activate is sufficient to hide a disabled plugin's commands (they're only registered after activation). (b) Already-activated plugins keep running until restart (I3 deactivation not wired) — documented in UI + followups. (c) `plugins:list` now returns `enabled` — the existing PluginSettingsSection already reads `plugins:list`, so the shape is additive. (d) The live refresh re-seeds the whole registry (resetToInternal + re-register) — simple and correct; internal panels are re-seeded by resetToInternal.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-manifold-plugins-enable-disable.md`.**
