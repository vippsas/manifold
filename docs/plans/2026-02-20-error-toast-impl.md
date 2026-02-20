# Error Toast System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface critical IPC errors (agent spawn failures, project errors) to the user via toast notifications in the bottom-right corner.

**Architecture:** Module-level event emitter (`toast.ts`) decouples error producers from the Toast UI component. Any hook imports `emitError()` to fire a toast. The `<Toast>` component subscribes on mount. No React Context or prop drilling needed.

**Tech Stack:** React, CSS custom properties (existing theme system), TypeScript

---

### Task 1: Create the toast event emitter

**Files:**
- Create: `src/renderer/toast.ts`

**Step 1: Write the event emitter module**

```typescript
type ToastListener = (message: string) => void

const listeners = new Set<ToastListener>()

export function emitError(message: string): void {
  for (const listener of listeners) {
    listener(message)
  }
}

export function onError(callback: ToastListener): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/renderer/toast.ts
git commit -m "feat: add toast event emitter module"
```

---

### Task 2: Create the Toast component

**Files:**
- Create: `src/renderer/components/Toast.tsx`

**Step 1: Write the Toast component**

```tsx
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { onError } from '../toast'

interface ToastItem {
  id: number
  message: string
}

const DISMISS_MS = 5000
const MAX_VISIBLE = 3

export function Toast(): React.JSX.Element | null {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  useEffect(() => {
    return onError((message) => {
      const id = nextId.current++
      setToasts((prev) => {
        const next = [...prev, { id, message }]
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next
      })
    })
  }, [])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const oldest = toasts[0]
    const timer = setTimeout(() => dismiss(oldest.id), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toasts, dismiss])

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 40,
      right: 16,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 14px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'var(--font-sans)',
            maxWidth: 360,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'toast-slide-in 0.2s ease-out',
          }}
        >
          <span style={{ color: 'var(--error)', flexShrink: 0, lineHeight: 1.4 }}>&#x2716;</span>
          <span style={{ flex: 1, lineHeight: 1.4, wordBreak: 'break-word' }}>{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            style={{
              flexShrink: 0,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              background: 'none',
              border: 'none',
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
```

**Step 2: Add the slide-in keyframe animation to theme.css**

Add at the end of `src/renderer/styles/theme.css`:

```css
/* ─── Toast Animation ─── */
@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/renderer/components/Toast.tsx src/renderer/styles/theme.css
git commit -m "feat: add Toast component with auto-dismiss"
```

---

### Task 3: Mount Toast in App.tsx

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Add the import**

Add after the other component imports (around line 22):

```typescript
import { Toast } from './components/Toast'
```

**Step 2: Render `<Toast />` in the main layout**

Add `<Toast />` as the last child inside the outermost `<div className={...}>` in the main return (line 242), right before the closing `</div>` on line 337:

```tsx
      <Toast />
    </div>
  )
```

Also add it to the two early-return branches (WelcomeDialog at line 218 and OnboardingView at line 229) the same way, so errors show even during setup.

**Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: mount Toast component in App root"
```

---

### Task 4: Wire up agent spawn errors

**Files:**
- Modify: `src/renderer/hooks/useAgentSession.ts`

**Step 1: Add emitError to the spawn catch block**

In the `useSpawnAgent` function (line 141-158), change the catch block from:

```typescript
      } catch {
        return null
      }
```

to:

```typescript
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        emitError(message)
        return null
      }
```

Add the import at the top of the file:

```typescript
import { emitError } from '../toast'
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/renderer/hooks/useAgentSession.ts
git commit -m "feat: surface agent spawn errors via toast"
```

---

### Task 5: Wire up project errors

**Files:**
- Modify: `src/renderer/hooks/useProjects.ts`

**Step 1: Add emitError alongside existing setError calls**

Add the import:

```typescript
import { emitError } from '../toast'
```

In each catch block that calls `setError(message)`, add `emitError(message)` right after. There are 4 catch blocks:
- `fetchProjects` (line 30)
- `addProject` (line 52)
- `cloneProject` (line 63)
- `removeProject` (line 73)

Example for each:

```typescript
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      emitError(message)
    }
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No new errors

**Step 3: Commit**

```bash
git add src/renderer/hooks/useProjects.ts
git commit -m "feat: surface project errors via toast"
```

---

### Task 6: Manual verification

**Step 1: Start dev mode**

Run: `npm run dev`

**Step 2: Trigger a spawn error**

Create an agent with a branch name that already exists (e.g. the same branch used by another agent). A toast should appear in the bottom-right with the error message.

**Step 3: Verify toast behavior**

- Toast appears with error icon and message
- Toast auto-dismisses after ~5 seconds
- Click X to manually dismiss
- Toast respects the current theme colors

**Step 4: Final commit (if any adjustments needed)**

```bash
git add -A && git commit -m "fix: toast adjustments from manual testing"
```
