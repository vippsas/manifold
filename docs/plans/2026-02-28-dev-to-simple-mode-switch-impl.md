# Developer → Simple Mode Switch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When switching from developer mode to simple mode with an active agent, kill the interactive session (auto-commit), spawn a non-interactive session with dev server, and open simple mode directly in the app view with a clean chat and live preview.

**Architecture:** Mirror the existing simple→developer switch pattern in reverse. The main process `app:switch-mode` handler gets a new `mode === 'simple'` branch that kills the interactive session, spawns a non-interactive one with dev server, and sends `app:auto-open-app` to the simple renderer. The simple renderer listens for this event and jumps straight to AppView.

**Tech Stack:** Electron IPC, React, node-pty

---

### Task 1: Pass active session context from StatusBar

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx:110-111`

**Step 1: Update the switch-mode call to pass projectId and sessionId**

The current code at line 111 is:
```tsx
onClick={() => window.electronAPI.invoke('app:switch-mode', 'simple')}
```

Change it to:
```tsx
onClick={() => window.electronAPI.invoke('app:switch-mode', 'simple', activeSession?.projectId, activeSession?.id)}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (the IPC handler already accepts optional args)

**Step 3: Commit**

```bash
git add src/renderer/components/StatusBar.tsx
git commit -m "feat: pass active session context when switching to simple mode"
```

---

### Task 2: Add `killInteractiveSession` to SessionManager

**Files:**
- Modify: `src/main/session-manager.ts` (after `killNonInteractiveSessions` at ~line 460)

**Step 1: Add the new method**

Add after the `killNonInteractiveSessions` method:

```typescript
async killInteractiveSession(sessionId: string): Promise<{
  projectPath: string
  branchName: string
  taskDescription?: string
}> {
  const session = this.sessions.get(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const branchName = session.branchName
  const taskDescription = session.taskDescription
  const worktreePath = session.worktreePath
  const projectId = session.projectId

  // Stop running processes
  if (session.ptyId) {
    try { this.ptyPool.kill(session.ptyId) } catch { /* already exited */ }
    session.ptyId = ''
  }
  if (session.devServerPtyId) {
    try { this.ptyPool.kill(session.devServerPtyId) } catch { /* already exited */ }
    session.devServerPtyId = undefined
  }

  // Auto-commit any uncommitted work
  try {
    const status = await gitExec(['status', '--porcelain'], worktreePath)
    if (status.trim().length > 0) {
      await gitExec(['add', '-A'], worktreePath)
      await gitExec(['commit', '-m', 'Auto-commit: work from developer mode'], worktreePath)
      debugLog(`[session] auto-committed changes on branch ${branchName}`)
    }
  } catch (err) {
    debugLog(`[session] auto-commit failed: ${err}`)
  }

  await this.killSession(sessionId)

  // Get project path for the dev server
  const project = this.projectRegistry.getProject(projectId)
  const projectPath = project?.path ?? worktreePath

  return { projectPath, branchName, taskDescription }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "feat: add killInteractiveSession method for dev-to-simple switch"
```

---

### Task 3: Add `startDevServerStandalone` to SessionManager

The existing `startDevServer` is private and works on InternalSession. We need a public method that creates a lightweight session entry and starts the dev server in the project directory, returning the session info the simple renderer needs.

**Files:**
- Modify: `src/main/session-manager.ts`

**Step 1: Add public method after `startDevServer`**

```typescript
/**
 * Start a dev server in the project directory and create a minimal
 * non-interactive session to track it. Used when switching from
 * developer mode to simple mode with an existing built project.
 */
startDevServerSession(projectId: string, branchName: string, taskDescription?: string): InternalSession {
  const project = this.resolveProject(projectId)

  const session: InternalSession = {
    id: uuidv4(),
    projectId,
    runtimeId: 'claude',
    branchName,
    worktreePath: project.path,
    status: 'running',
    pid: null,
    ptyId: '',
    outputBuffer: '',
    taskDescription,
    additionalDirs: [],
    noWorktree: true,
    nonInteractive: true,
  }
  this.sessions.set(session.id, session)
  this.startDevServer(session)
  return session
}
```

Note: This returns `InternalSession` which is internal to the module. Since we only call it from `index.ts` which has access to `sessionManager`, we'll extract the needed fields there. Actually, let's return a public shape instead:

```typescript
startDevServerSession(projectId: string, branchName: string, taskDescription?: string): { sessionId: string } {
  const project = this.resolveProject(projectId)

  const session: InternalSession = {
    id: uuidv4(),
    projectId,
    runtimeId: 'claude',
    branchName,
    worktreePath: project.path,
    status: 'running',
    pid: null,
    ptyId: '',
    outputBuffer: '',
    taskDescription,
    additionalDirs: [],
    noWorktree: true,
    nonInteractive: true,
  }
  this.sessions.set(session.id, session)

  // Subscribe chat adapter
  this.chatAdapter?.addSystemMessage(session.id, 'Your app is running. Send a message to make changes.')

  this.startDevServer(session)

  return { sessionId: session.id }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/session-manager.ts
git commit -m "feat: add startDevServerSession for dev-to-simple mode switch"
```

---

### Task 4: Add `mode === 'simple'` branch to `app:switch-mode` handler

**Files:**
- Modify: `src/main/index.ts:344-366`

**Step 1: Update the handler signature and add the simple branch**

Replace the entire `app:switch-mode` handler (lines 344-366) with:

```typescript
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
      const { sessionId: newSessionId } = sessionManager.startDevServerSession(
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

  if (mainWindow) {
    mainWindow.close()
  }
  createWindow()

  if (mode === 'developer' && projectId) {
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('app:auto-spawn', projectId, branchName)
    })
  }

  if (mode === 'simple' && simpleAppPayload) {
    mainWindow?.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('app:auto-open-app', simpleAppPayload)
    })
  }
})
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: handle dev-to-simple mode switch with session transfer"
```

---

### Task 5: Add `app:auto-open-app` to simple preload whitelist

**Files:**
- Modify: `src/preload/simple.ts:32-42`

**Step 1: Add the channel**

Add `'app:auto-open-app'` to the `ALLOWED_LISTEN_CHANNELS` array (after line 41, before the closing `] as const`):

```typescript
const ALLOWED_LISTEN_CHANNELS = [
  'agent:status',
  'agent:exit',
  'simple:chat-message',
  'simple:deploy-status-update',
  'preview:url-detected',
  'updater:status',
  'show-about',
  'show-settings',
  'settings:changed',
  'app:auto-open-app',
] as const
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/preload/simple.ts
git commit -m "feat: whitelist app:auto-open-app in simple preload"
```

---

### Task 6: Listen for `app:auto-open-app` in simple renderer App.tsx

**Files:**
- Modify: `src/renderer-simple/App.tsx`

**Step 1: Add useEffect to listen for the event**

Add a `useEffect` in the `App` component (after the existing `useLayoutEffect` for theme, around line 71):

```tsx
import React, { useState, useEffect, useLayoutEffect } from 'react'
```

Then add after the theme `useLayoutEffect`:

```tsx
useEffect(() => {
  const unsub = window.electronAPI.on('app:auto-open-app', (...args: unknown[]) => {
    const app = args[0] as SimpleApp
    if (app?.sessionId && app?.projectId) {
      // Subscribe to chat messages for the new session
      void window.electronAPI.invoke('simple:subscribe-chat', app.sessionId)
      setView({ kind: 'app', app })
    }
  })
  return unsub
}, [])
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Manual test**

1. Start the app in dev mode (`npm run dev`)
2. Select a project and spawn an agent in developer mode
3. Wait for the agent to do some work
4. Click "Simple View" in the status bar
5. Verify: simple mode opens directly in app view (not dashboard)
6. Verify: chat shows system welcome message
7. Verify: preview pane loads once dev server starts

**Step 4: Commit**

```bash
git add src/renderer-simple/App.tsx
git commit -m "feat: auto-open app view when switching from developer mode"
```

---

### Task 7: Final verification and cleanup

**Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Run tests**

Run: `npm test`
Expected: All existing tests pass

**Step 3: Test both switch directions**

1. Developer → Simple: active agent → should land in app view with clean chat + preview
2. Simple → Developer: existing app → should land in developer with agent resumed on branch
3. Developer → Simple with no active agent → should land on dashboard (existing behavior unchanged)

**Step 4: Final commit if any cleanup needed**
