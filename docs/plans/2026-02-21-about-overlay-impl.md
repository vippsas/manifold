# About Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an "About Manifold" overlay showing version, author, and origin, triggered from the macOS app menu.

**Architecture:** Custom Electron Menu sends `show-about` IPC push event to renderer. Renderer shows a modal overlay component following the existing SettingsModal pattern.

**Tech Stack:** Electron Menu API, IPC (main→renderer push), React, inline style objects.

---

### Task 1: Add `show-about` to preload listen whitelist

**Files:**
- Modify: `src/preload/index.ts:47-54`

**Step 1: Add channel to whitelist**

In `ALLOWED_LISTEN_CHANNELS`, add `'show-about'` after `'agent:conflicts'`:

```typescript
const ALLOWED_LISTEN_CHANNELS = [
  'agent:output',
  'agent:status',
  'agent:exit',
  'files:changed',
  'settings:changed',
  'agent:conflicts',
  'show-about',
] as const
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: whitelist show-about IPC listen channel"
```

---

### Task 2: Create AboutOverlay styles

**Files:**
- Create: `src/renderer/components/AboutOverlay.styles.ts`

**Step 1: Create the styles file**

Follow the SettingsModal.styles.ts pattern — `Record<string, React.CSSProperties>`:

```typescript
import type React from 'react'

export const aboutStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    width: '320px',
    maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
  },
  title: {
    fontWeight: 600,
    fontSize: '14px',
  },
  closeButton: {
    fontSize: '18px',
    color: 'var(--text-secondary)',
    padding: '0 4px',
    lineHeight: 1,
  },
  body: {
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  appName: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  version: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  author: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginTop: '12px',
  },
  origin: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  closeFooterButton: {
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
  },
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/AboutOverlay.styles.ts
git commit -m "feat: add AboutOverlay styles"
```

---

### Task 3: Create AboutOverlay component

**Files:**
- Create: `src/renderer/components/AboutOverlay.tsx`

**Step 1: Create the component**

Follow the SettingsModal pattern (overlay ref, click-outside, Escape, close button):

```tsx
import React, { useCallback, useRef } from 'react'
import { aboutStyles } from './AboutOverlay.styles'

interface AboutOverlayProps {
  visible: boolean
  onClose: () => void
}

export function AboutOverlay({ visible, onClose }: AboutOverlayProps): React.JSX.Element | null {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent): void => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      onKeyDown={handleKeyDown}
      style={aboutStyles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="About Manifold"
    >
      <div style={aboutStyles.panel}>
        <div style={aboutStyles.header}>
          <span style={aboutStyles.title}>About Manifold</span>
          <button onClick={onClose} style={aboutStyles.closeButton}>&times;</button>
        </div>
        <div style={aboutStyles.body}>
          <span style={aboutStyles.appName}>Manifold</span>
          <span style={aboutStyles.version}>v0.0.1</span>
          <span style={aboutStyles.author}>Made by Sven Malvik</span>
          <span style={aboutStyles.origin}>Norway &middot; 2026</span>
        </div>
        <div style={aboutStyles.footer}>
          <button onClick={onClose} style={aboutStyles.closeFooterButton}>Close</button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/components/AboutOverlay.tsx
git commit -m "feat: add AboutOverlay component"
```

---

### Task 4: Wire AboutOverlay into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add import**

Add after the `SettingsModal` import (line 22):

```typescript
import { AboutOverlay } from './components/AboutOverlay'
```

**Step 2: Add state**

After `const [showSettings, setShowSettings] = useState(false)` (line 105), add:

```typescript
const [showAbout, setShowAbout] = useState(false)
```

**Step 3: Add IPC listener**

After the `useSessionStatePersistence` call (line 92), add a `useEffect` to listen for the `show-about` push event from main:

```typescript
React.useEffect(() => {
  const unsub = window.electronAPI.on('show-about', () => setShowAbout(true))
  return unsub
}, [])
```

**Step 4: Render the overlay**

After the `<SettingsModal>` block (around line 313), add:

```tsx
<AboutOverlay
  visible={showAbout}
  onClose={() => setShowAbout(false)}
/>
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire AboutOverlay into App with IPC listener"
```

---

### Task 5: Create Electron Menu with About item

**Files:**
- Modify: `src/main/index.ts`

**Step 1: Add Menu import**

Change the Electron import (line 1) to include `Menu`:

```typescript
import { app, BrowserWindow, ipcMain, Menu, nativeTheme, shell } from 'electron'
```

**Step 2: Build and set the menu**

Inside `createWindow()`, after the `mainWindow.on('closed', ...)` block (after line 144), add:

```typescript
const menuTemplate: Electron.MenuItemConstructorOptions[] = [
  {
    label: app.name,
    submenu: [
      {
        label: 'About Manifold',
        click: () => mainWindow?.webContents.send('show-about'),
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
Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add custom Electron menu with About Manifold item"
```

---

### Task 6: Manual verification

**Step 1: Start dev mode**

Run: `npm run dev`

**Step 2: Verify menu**

Click "Manifold" in the macOS menu bar. Confirm "About Manifold" is the first item.

**Step 3: Verify overlay**

Click "About Manifold". Confirm the overlay appears with:
- Title: "About Manifold"
- Body: "Manifold", "v0.0.1", "Made by Sven Malvik", "Norway · 2026"
- Close via: x button, Close button, click outside, Escape key

**Step 4: Verify other menus**

Confirm Edit (undo/redo/copy/paste), View (reload/devtools/zoom), Window (minimize/zoom) menus work.
