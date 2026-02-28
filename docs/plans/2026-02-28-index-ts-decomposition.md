# index.ts Decomposition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decompose `src/main/index.ts` (437 lines) into 3 focused modules, reducing it to ~240 lines.

**Architecture:** Extract menu template into `app-menu.ts`, auto-updater wiring into `auto-updater.ts`, and mode-switching/theme logic into `mode-switcher.ts`. Each module is a pure function or small class. `index.ts` remains the composition root.

**Tech Stack:** Electron, TypeScript, vitest

**Baseline:** 33 test files, 440 tests passing. Typecheck clean.

---

### Task 1: Extract `app-menu.ts`

**Files:**
- Create: `src/main/app-menu.ts`
- Modify: `src/main/index.ts:176-268`

**Step 1: Create `src/main/app-menu.ts`**

```typescript
import { BrowserWindow, Menu } from 'electron'

export function buildAppMenu(mainWindow: BrowserWindow): Menu {
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Manifold',
      submenu: [
        {
          label: 'About Manifold',
          click: () => mainWindow?.webContents.send('show-about'),
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.send('show-settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Projects',
          accelerator: 'CmdOrCtrl+1',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'projects'),
        },
        {
          label: 'Toggle Agent',
          accelerator: 'CmdOrCtrl+2',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'agent'),
        },
        {
          label: 'Toggle Editor',
          accelerator: 'CmdOrCtrl+3',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'editor'),
        },
        {
          label: 'Toggle Files',
          accelerator: 'CmdOrCtrl+4',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'fileTree'),
        },
        {
          label: 'Toggle Modified Files',
          accelerator: 'CmdOrCtrl+5',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'modifiedFiles'),
        },
        {
          label: 'Toggle Shell',
          accelerator: 'CmdOrCtrl+6',
          click: () => mainWindow?.webContents.send('view:toggle-panel', 'shell'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  return Menu.buildFromTemplate(menuTemplate)
}
```

**Step 2: Update `index.ts` to use it**

Replace lines 176-267 in `createWindow()`:

```typescript
const menuTemplate: Electron.MenuItemConstructorOptions[] = [
  // ... ~90 lines of menu template ...
]
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
```

With:

```typescript
import { buildAppMenu } from './app-menu'
// ... (add to imports at top)

// Inside createWindow(), replace the menu block with:
Menu.setApplicationMenu(buildAppMenu(mainWindow))
```

Also remove the `Menu` import from the Electron import line (only `Menu.setApplicationMenu` remains, which is a static call — keep `Menu` in the import).

**Step 3: Run tests**

```bash
npx vitest run
```

Expected: 440 tests still passing (no test file for index.ts exists, so no test changes needed).

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: Clean.

**Step 5: Commit**

```bash
git add src/main/app-menu.ts src/main/index.ts
git commit -m "refactor: extract app menu template to app-menu.ts"
```

---

### Task 2: Extract `auto-updater.ts`

**Files:**
- Create: `src/main/auto-updater.ts`
- Modify: `src/main/index.ts:307-334`

**Step 1: Create `src/main/auto-updater.ts`**

```typescript
import { BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { debugLog } from './debug-log'

export function setupAutoUpdater(window: BrowserWindow): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    debugLog('[updater] checking for update…')
  })
  autoUpdater.on('update-available', (info) => {
    debugLog(`[updater] update available: ${info.version}`)
    window.webContents.send('updater:status', { status: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    debugLog('[updater] up to date')
  })
  autoUpdater.on('download-progress', (progress) => {
    debugLog(`[updater] downloading: ${Math.round(progress.percent)}%`)
  })
  autoUpdater.on('update-downloaded', (info) => {
    debugLog(`[updater] downloaded: ${info.version}`)
    window.webContents.send('updater:status', { status: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    debugLog(`[updater] error: ${err.message}`)
  })

  autoUpdater.checkForUpdatesAndNotify()
}
```

**Step 2: Update `index.ts`**

- Add import at top: `import { setupAutoUpdater } from './auto-updater'`
- Remove the `import { autoUpdater } from 'electron-updater'` line (line 2)
- Delete the `setupAutoUpdater` function definition (lines 308-334)
- The call site in `app.whenReady()` already calls `setupAutoUpdater(mainWindow)` — no change needed there.

**Step 3: Run tests**

```bash
npx vitest run
```

Expected: 440 tests passing.

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: Clean.

**Step 5: Commit**

```bash
git add src/main/auto-updater.ts src/main/index.ts
git commit -m "refactor: extract auto-updater setup to auto-updater.ts"
```

---

### Task 3: Extract `mode-switcher.ts`

**Files:**
- Create: `src/main/mode-switcher.ts`
- Modify: `src/main/index.ts:336-410`

**Step 1: Create `src/main/mode-switcher.ts`**

```typescript
import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { debugLog } from './debug-log'
import type { SettingsStore } from './settings-store'
import type { SessionManager } from './session-manager'

interface ModeSwitcherDeps {
  settingsStore: SettingsStore
  sessionManager: SessionManager
}

export class ModeSwitcher {
  private deps: ModeSwitcherDeps

  constructor(deps: ModeSwitcherDeps) {
    this.deps = deps
  }

  register(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void
  ): void {
    this.registerThemeHandler(getMainWindow)
    this.registerModeSwitchHandler(createWindow, getMainWindow, setMainWindow)
  }

  private registerThemeHandler(getMainWindow: () => BrowserWindow | null): void {
    ipcMain.on('theme:changed', (_event, payload: { type: string; background: string }) => {
      nativeTheme.themeSource = (payload.type === 'light' ? 'light' : 'dark') as 'dark' | 'light'
      const win = getMainWindow()
      if (win) {
        win.setBackgroundColor(payload.background)
      }
    })
  }

  private registerModeSwitchHandler(
    createWindow: () => void,
    getMainWindow: () => BrowserWindow | null,
    setMainWindow: (win: BrowserWindow | null) => void
  ): void {
    const { settingsStore, sessionManager } = this.deps

    ipcMain.handle('app:switch-mode', async (_event, mode: 'developer' | 'simple', projectId?: string, sessionId?: string) => {
      settingsStore.updateSettings({ uiMode: mode })

      let branchName: string | undefined
      let simpleAppPayload: Record<string, unknown> | undefined

      if (mode === 'developer' && projectId) {
        const result = await sessionManager.killNonInteractiveSessions(projectId)
        branchName = result.branchName
        if (result.killedIds.length > 0) {
          debugLog(`[switch-mode] killed ${result.killedIds.length} non-interactive session(s), branch: ${branchName}`)
        }
      }

      if (mode === 'simple' && projectId && sessionId) {
        try {
          const result = await sessionManager.killInteractiveSession(sessionId)
          const { sessionId: newSessionId } = await sessionManager.startDevServerSession(
            projectId,
            result.branchName,
            result.taskDescription
          )
          simpleAppPayload = {
            sessionId: newSessionId,
            projectId,
            name: result.branchName.replace('manifold/', ''),
            description: result.taskDescription ?? '',
            status: 'building',
            previewUrl: null,
            liveUrl: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          debugLog(`[switch-mode] dev→simple: killed session ${sessionId}, new session ${newSessionId}`)
        } catch (err) {
          debugLog(`[switch-mode] dev→simple failed: ${err}`)
        }
      }

      const currentWin = getMainWindow()
      if (currentWin) {
        currentWin.destroy()
        setMainWindow(null)
      }
      createWindow()

      const newWindow = getMainWindow()
      if (mode === 'developer' && projectId && newWindow) {
        newWindow.webContents.once('did-finish-load', () => {
          newWindow.webContents.send('app:auto-spawn', projectId, branchName)
        })
      }

      if (mode === 'simple' && simpleAppPayload && newWindow) {
        newWindow.webContents.once('did-finish-load', () => {
          newWindow.webContents.send('app:auto-open-app', simpleAppPayload)
        })
      }
    })
  }
}
```

**Step 2: Update `index.ts`**

- Add import: `import { ModeSwitcher } from './mode-switcher'`
- After module instantiation block (after line 92), add:

```typescript
const modeSwitcher = new ModeSwitcher({ settingsStore, sessionManager })
modeSwitcher.register(
  createWindow,
  () => mainWindow,
  (win) => { mainWindow = win }
)
```

- Delete the `theme:changed` listener (lines 339-344)
- Delete the `app:switch-mode` handler (lines 349-410)
- Delete the section comments for `── Theme ──` and `── Mode switching ──`

**Important note:** The `modeSwitcher.register()` call references `createWindow` which is defined later in the file. This works because `register()` stores the function reference and only calls it later when the IPC event fires. However, to be safe, move the `register()` call to after `createWindow` is defined — place it just before the `app.whenReady()` block.

**Step 3: Run tests**

```bash
npx vitest run
```

Expected: 440 tests passing.

**Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: Clean.

**Step 5: Commit**

```bash
git add src/main/mode-switcher.ts src/main/index.ts
git commit -m "refactor: extract mode switching and theme handling to mode-switcher.ts"
```

---

### Task 4: Clean up `index.ts` and verify

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Clean up unused imports**

Review `index.ts` imports and remove any that are no longer used:
- `autoUpdater` from `electron-updater` (moved to `auto-updater.ts`)
- `Menu` may still be needed for `Menu.setApplicationMenu` — check
- Verify all Electron imports are still needed: `app`, `BrowserWindow`, `ipcMain`, `nativeTheme`, `shell`
  - `ipcMain` — still used in `wireModules` via `registerIpcHandlers`, but `ipcMain` itself may no longer be directly referenced in index.ts (the `ipcMain.on`/`ipcMain.handle` calls moved to `mode-switcher.ts`). Check if `ipcMain` is still imported in `ipc-handlers.ts` directly. If `index.ts` no longer uses `ipcMain` directly, remove it from the import.
  - `nativeTheme` — only used in `createWindow()` line `nativeTheme.themeSource = ...`. Keep it.
  - `shell` — used in `createWindow()` for `shell.openExternal`. Keep it.

**Step 2: Verify section organization**

The remaining `index.ts` should have these sections in order:
1. `loadShellPath()` and startup side-effects (lines 1-56)
2. Module imports and instantiation (lines 57-92)
3. Theme/background helpers: `resolveInitialBackground()`, `resolveThemeType()` (tiny, keep here — only used by `createWindow`)
4. `createWindow()` — window creation + webview security + external links (~70 lines)
5. `wireModules()` and `loadRenderer()` (~30 lines)
6. ModeSwitcher registration (3 lines)
7. App lifecycle (`whenReady`, `window-all-closed`, `before-quit`) (~25 lines)

**Step 3: Run full verification**

```bash
npx vitest run
npm run typecheck
```

Expected: 440 tests passing, typecheck clean.

**Step 4: Verify line count**

```bash
wc -l src/main/index.ts src/main/app-menu.ts src/main/auto-updater.ts src/main/mode-switcher.ts
```

Expected: `index.ts` ~240 lines, total across all 4 files similar to original 437.

**Step 5: Final commit**

```bash
git add src/main/index.ts
git commit -m "refactor: clean up index.ts imports after decomposition"
```
