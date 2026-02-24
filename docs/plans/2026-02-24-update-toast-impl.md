# Update Toast Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show a persistent Cursor-style bottom-right toast when an update has been downloaded, with a Restart button to install it.

**Architecture:** New `useUpdateNotification` hook listens for `updater:status` IPC events and exposes state. New `UpdateToast` component renders a fixed-position toast when status is `downloaded`. Mounted in `App.tsx`.

**Tech Stack:** React 18, Electron IPC, CSS-in-JS (co-located `.styles.ts`)

---

### Task 1: Create the `useUpdateNotification` hook

**Files:**
- Create: `src/renderer/hooks/useUpdateNotification.ts`

**Step 1: Write the hook**

```ts
import { useState, useEffect } from 'react'

interface UpdateState {
  status: 'idle' | 'available' | 'downloaded'
  version: string | null
  dismissed: boolean
}

export interface UseUpdateNotificationResult {
  updateReady: boolean
  version: string | null
  dismiss: () => void
  install: () => void
}

export function useUpdateNotification(): UseUpdateNotificationResult {
  const [state, setState] = useState<UpdateState>({ status: 'idle', version: null, dismissed: false })

  useEffect(() => {
    const unsub = window.electronAPI.on('updater:status', (payload: unknown) => {
      const { status, version } = payload as { status: string; version: string }
      if (status === 'available' || status === 'downloaded') {
        setState((prev) => ({ ...prev, status: status as 'available' | 'downloaded', version }))
      }
    })
    return unsub
  }, [])

  const dismiss = (): void => {
    setState((prev) => ({ ...prev, dismissed: true }))
  }

  const install = (): void => {
    void window.electronAPI.invoke('updater:install')
  }

  return {
    updateReady: state.status === 'downloaded' && !state.dismissed,
    version: state.version,
    dismiss,
    install,
  }
}
```

**Step 2: Commit**

```bash
git add src/renderer/hooks/useUpdateNotification.ts
git commit -m "feat: add useUpdateNotification hook for update IPC events"
```

---

### Task 2: Create UpdateToast styles

**Files:**
- Create: `src/renderer/components/UpdateToast.styles.ts`

**Step 1: Write the styles**

Follow project convention (typed `Record<string, React.CSSProperties>`, uses `var(--*)` theme tokens, co-located `.styles.ts` file).

```ts
import type React from 'react'

export const toastStyles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    bottom: '16px',
    right: '16px',
    zIndex: 10000,
    width: '300px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
    overflow: 'hidden',
    animation: 'toast-slide-up 0.25s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px 0 12px',
  },
  title: {
    fontWeight: 600,
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  dismissButton: {
    fontSize: '16px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '0 4px',
    borderRadius: '4px',
  },
  body: {
    padding: '6px 12px 12px 12px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.4,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '0 12px 10px 12px',
  },
  restartButton: {
    fontSize: '12px',
    fontWeight: 500,
    padding: '5px 14px',
    borderRadius: '4px',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    cursor: 'pointer',
  },
}
```

**Step 2: Add `@keyframes toast-slide-up` to theme.css**

Append to end of `src/renderer/styles/theme.css`:

```css
/* ─── Toast Animation ─── */
@keyframes toast-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 3: Commit**

```bash
git add src/renderer/components/UpdateToast.styles.ts src/renderer/styles/theme.css
git commit -m "feat: add UpdateToast styles and slide-up animation keyframe"
```

---

### Task 3: Create UpdateToast component

**Files:**
- Create: `src/renderer/components/UpdateToast.tsx`

**Step 1: Write the component**

```tsx
import React from 'react'
import { toastStyles } from './UpdateToast.styles'

interface UpdateToastProps {
  version: string | null
  onRestart: () => void
  onDismiss: () => void
}

export function UpdateToast({ version, onRestart, onDismiss }: UpdateToastProps): React.JSX.Element {
  return (
    <div style={toastStyles.container} role="alert">
      <div style={toastStyles.header}>
        <span style={toastStyles.title}>Update available</span>
        <button onClick={onDismiss} style={toastStyles.dismissButton} title="Dismiss">
          &times;
        </button>
      </div>
      <div style={toastStyles.body}>
        Manifold v{version} is ready. Restart to update.
      </div>
      <div style={toastStyles.footer}>
        <button onClick={onRestart} style={toastStyles.restartButton}>
          Restart
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/components/UpdateToast.tsx
git commit -m "feat: add UpdateToast component"
```

---

### Task 4: Wire UpdateToast into App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add import**

After the existing `import { useStatusNotification } ...` line (line 15), add:

```ts
import { useUpdateNotification } from './hooks/useUpdateNotification'
```

After the existing `import { AboutOverlay } ...` line (line 24), add:

```ts
import { UpdateToast } from './components/UpdateToast'
```

**Step 2: Call the hook inside `App()`**

After `const { themeId, themeClass, xtermTheme, setPreviewThemeId } = useTheme(settings.theme)` (line 100), add:

```ts
const updateNotification = useUpdateNotification()
```

**Step 3: Render the toast**

Inside the main return, just before the closing `</div>` of the root (before line 254), add:

```tsx
{updateNotification.updateReady && (
  <UpdateToast
    version={updateNotification.version}
    onRestart={updateNotification.install}
    onDismiss={updateNotification.dismiss}
  />
)}
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors

**Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire UpdateToast into App with useUpdateNotification hook"
```

---

### Task 5: Verify end-to-end

**Step 1: Run dev server**

Run: `npm run dev`
Expected: App starts with no errors. No toast visible (no update available in dev).

**Step 2: Run tests**

Run: `npm test`
Expected: All existing tests pass.

**Step 3: Final commit (if any fixups needed)**
