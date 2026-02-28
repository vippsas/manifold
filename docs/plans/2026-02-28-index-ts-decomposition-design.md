# Design: Decompose `src/main/index.ts` by Responsibility

**Date:** 2026-02-28
**Branch:** manifold/refacor-3
**Approach:** Extract by responsibility (Approach A)

## Problem

`src/main/index.ts` is 437 lines mixing shell PATH resolution, 15 service instantiations, window creation, menu templates, auto-updater, mode switching, theme handling, and app lifecycle. The menu template alone is ~90 lines, and the mode-switch handler embeds significant business logic (session killing, dev server startup, window recreation).

## New Files

### 1. `src/main/app-menu.ts` (~95 lines)

Exports `buildAppMenu(mainWindow: BrowserWindow): Menu`.

Contains the full menu template (Manifold, Edit, View, Window). Pure function — takes a `BrowserWindow` for `send()` calls. Called from `createWindow()` in index.ts.

### 2. `src/main/auto-updater.ts` (~35 lines)

Exports `setupAutoUpdater(window: BrowserWindow): void`.

Moves the `electron-updater` import and all event wiring (checking, available, not-available, download-progress, downloaded, error). Called from `app.whenReady()`.

### 3. `src/main/mode-switcher.ts` (~80 lines)

Exports a `ModeSwitcher` class.

Constructor deps: `{ settingsStore, sessionManager }`. Public method `register(ipcMain, createWindowFn, getMainWindowFn)` registers:
- `app:switch-mode` handler (kill sessions, recreate window, send auto-spawn/auto-open)
- `theme:changed` listener (update nativeTheme, set background color)

Uses `createWindowFn()` callback to recreate the window without knowing BrowserWindow details. Uses `getMainWindowFn()` to access the current mainWindow reference.

## Changes to `index.ts`

- Import `buildAppMenu` and call it inside `createWindow()` replacing inline template
- Import `setupAutoUpdater` and call it in `app.whenReady()`
- Instantiate `ModeSwitcher`, call `modeSwitcher.register()` after module setup
- Remove inline theme listener and mode-switch handler

## What Stays in `index.ts` (~240 lines)

- `loadShellPath()` — must run before imports, entry-point concern
- Module instantiation block (15 services) — composition root
- `createWindow()` — window creation + webview security + external link handling
- `wireModules()` / `loadRenderer()` — small helpers
- App lifecycle (`whenReady`, `window-all-closed`, `before-quit`)

## Testing

- `app-menu.ts` — pure function, testable by asserting menu structure
- `auto-updater.ts` — thin wrapper, no dedicated test (just event wiring)
- `mode-switcher.ts` — unit testable with mocked deps

## Not Changed

- Preload allowlists (no new IPC channels)
- Shared types
- Other main-process modules
- Renderer code

## Expected Result

| File | Lines |
|------|-------|
| `index.ts` | ~240 |
| `app-menu.ts` | ~95 |
| `auto-updater.ts` | ~35 |
| `mode-switcher.ts` | ~80 |
