# Auto-Start Dev Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When a user clicks an idle app card in simple view, auto-start the dev server and show the preview.

**Architecture:** New `agent:start-dev-server` IPC channel calls existing `startDevServerSession()`. The renderer calls it when navigating to an idle app. `SimpleApp` gains a `branchName` field so the renderer can pass it to the IPC.

**Tech Stack:** Electron IPC, React, TypeScript

---

### Task 1: Add `branchName` to `SimpleApp` type

**Files:**
- Modify: `src/shared/simple-types.ts:13-24`

**Step 1: Add the field**

In `SimpleApp` interface, add `branchName` after `projectId`:

```typescript
export interface SimpleApp {
  sessionId: string
  projectId: string
  branchName: string          // <-- add this line
  name: string
  description: string
  status: AppStatus
  previewUrl: string | null
  liveUrl: string | null
  projectPath: string
  createdAt: number
  updatedAt: number
}
```

**Step 2: Update `useApps` to populate `branchName`**

- Modify: `src/renderer-simple/hooks/useApps.ts:49-65`

The sessions returned by `agent:sessions` already include `branchName`. Add it to the type cast on line 27 (it's already there) and to the `SimpleApp` construction:

```typescript
const simpleApps: SimpleApp[] = simpleSessions.map((s) => ({
  sessionId: s.id,
  projectId: s.projectId,
  branchName: s.branchName,     // <-- add this line
  name: projectMap.get(s.projectId)?.name ?? s.branchName.replace('manifold/', ''),
  description: s.taskDescription ?? '',
  status:
    s.status === 'done' ? 'live'
    : s.status === 'error' ? 'error'
    : s.status === 'running' ? 'building'
    : s.status === 'waiting' ? 'previewing'
    : 'idle',
  previewUrl: null,
  liveUrl: null,
  projectPath: projectMap.get(s.projectId)?.path ?? '',
  createdAt: Date.now(),
  updatedAt: Date.now(),
}))
```

Also update the `NewAppForm` `onStart` handler in `App.tsx` to include `branchName` in the `SimpleApp` it constructs (line 106-117):

```typescript
const newApp: SimpleApp = {
  sessionId: session.id,
  projectId: project.id,
  branchName: session.branchName ?? '',   // <-- add this line
  name,
  description,
  status: 'building',
  previewUrl: null,
  liveUrl: null,
  projectPath: project.path,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

Note: `session` is returned by `agent:spawn` and includes `branchName` (see `AgentSession` type).

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (or only pre-existing errors unrelated to our change)

**Step 4: Commit**

```bash
git add src/shared/simple-types.ts src/renderer-simple/hooks/useApps.ts src/renderer-simple/App.tsx
git commit -m "feat: add branchName to SimpleApp type"
```

---

### Task 2: Add `agent:start-dev-server` IPC handler

**Files:**
- Modify: `src/main/ipc/agent-handlers.ts:61` (after `agent:delete-app` handler)

**Step 1: Add the handler**

After the `agent:delete-app` handler (line 61), add:

```typescript
  ipcMain.handle(
    'agent:start-dev-server',
    (_event, projectId: string, branchName: string, description?: string) => {
      return sessionManager.startDevServerSession(projectId, branchName, description)
    },
  )
```

**Step 2: Whitelist in simple preload**

- Modify: `src/preload/simple.ts:3-27`

Add `'agent:start-dev-server'` to `ALLOWED_INVOKE_CHANNELS` (after `'agent:delete-app'`):

```typescript
const ALLOWED_INVOKE_CHANNELS = [
  'projects:list',
  'projects:add',
  'projects:open-dialog',
  'projects:clone',
  'projects:create-new',
  'agent:spawn',
  'agent:kill',
  'agent:delete-app',
  'agent:start-dev-server',     // <-- add this line
  'agent:input',
  // ... rest unchanged
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add src/main/ipc/agent-handlers.ts src/preload/simple.ts
git commit -m "feat: add agent:start-dev-server IPC channel"
```

---

### Task 3: Auto-start dev server on idle card click

**Files:**
- Modify: `src/renderer-simple/App.tsx:134`

**Step 1: Update `onSelectApp` to start dev server for idle apps**

Replace the `onSelectApp` handler on line 134:

```typescript
onSelectApp={async (app) => {
  if (app.status === 'idle') {
    const result = (await window.electronAPI.invoke(
      'agent:start-dev-server',
      app.projectId,
      app.branchName,
      app.description,
    )) as { sessionId: string }
    await window.electronAPI.invoke('simple:subscribe-chat', result.sessionId)
    setView({
      kind: 'app',
      app: { ...app, sessionId: result.sessionId, status: 'building' },
    })
    refreshApps()
  } else {
    await window.electronAPI.invoke('simple:subscribe-chat', app.sessionId)
    setView({ kind: 'app', app })
  }
}}
```

This:
1. Calls `agent:start-dev-server` which creates a new session with a running dev server
2. Subscribes to chat for the new session
3. Updates the app's `sessionId` and sets status to `building` so the UI shows the right state
4. For non-idle apps, just navigates as before (and subscribes to chat)

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer-simple/App.tsx
git commit -m "feat: auto-start dev server when clicking idle app card"
```

---

### Task 4: Add "Starting app..." spinner to PreviewPane

**Files:**
- Modify: `src/renderer-simple/components/PreviewPane.tsx:67-68`
- Modify: `src/renderer-simple/components/PreviewPane.styles.ts`

**Step 1: Add a `starting` prop to PreviewPane**

Update the `Props` interface:

```typescript
interface Props {
  url: string | null
  isAgentWorking?: boolean
  starting?: boolean
}
```

Update the component signature:

```typescript
export function PreviewPane({ url, isAgentWorking, starting }: Props): React.JSX.Element {
```

**Step 2: Add the spinner state**

Replace the empty-state block (lines 67-69):

```typescript
if (!url) {
  return (
    <div style={styles.emptyState}>
      {starting ? (
        <>
          <div style={styles.spinner} />
          <span>Starting app...</span>
        </>
      ) : (
        'Preview will appear here once the app is running...'
      )}
    </div>
  )
}
```

**Step 3: Add spinner CSS-in-JS style**

In `PreviewPane.styles.ts`, add after the `emptyState` style:

```typescript
export const spinner: CSSProperties = {
  width: 24,
  height: 24,
  border: '3px solid var(--border)',
  borderTop: '3px solid var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  marginBottom: 12,
}
```

Note: CSS-in-JS `animation` requires a `@keyframes` rule. Add a global keyframe in the simple-view theme CSS or use a different approach. Since this codebase uses inline styles, we'll inject the keyframe once via a side-effect in PreviewPane:

At the top of `PreviewPane.tsx`, add after imports:

```typescript
// Inject spinner keyframe once
if (typeof document !== 'undefined' && !document.getElementById('sp-keyframe')) {
  const style = document.createElement('style')
  style.id = 'sp-keyframe'
  style.textContent = '@keyframes spin { to { transform: rotate(360deg) } }'
  document.head.appendChild(style)
}
```

**Step 4: Pass `starting` prop from AppView**

- Modify: `src/renderer-simple/components/AppView.tsx`

Find where `PreviewPane` is rendered and pass the new prop. The `starting` state is true when the app status is `building` and no `previewUrl` exists yet:

Check `AppView.tsx` for how `PreviewPane` is used, then pass:

```typescript
<PreviewPane
  url={previewUrl}
  isAgentWorking={isAgentWorking}
  starting={!previewUrl && (status === 'building' || status === 'idle')}
/>
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add src/renderer-simple/components/PreviewPane.tsx src/renderer-simple/components/PreviewPane.styles.ts src/renderer-simple/components/AppView.tsx
git commit -m "feat: add Starting app spinner to PreviewPane"
```

---

### Task 5: Verify end-to-end

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS with zero errors

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass

**Step 3: Manual smoke test**

Run: `npm run dev`

1. Open simple view
2. Verify existing idle app cards show on dashboard
3. Click an idle card → should see "Starting app..." spinner
4. Once dev server outputs a URL → preview should appear in webview
5. Click back → click the card again → now it's no longer idle, should open directly with existing preview
