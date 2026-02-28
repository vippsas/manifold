# Developer → Simple Mode Switch Design

**Date**: 2026-02-28
**Branch**: manifold/fresh-chat

## Problem

When a user has an active selected agent in developer mode and switches to simple mode, the app opens to the dashboard with no awareness of the running agent. The user expects to land directly in the app view with a clean chat and a running preview.

## Requirements

1. Switching dev→simple with an active agent opens simple mode immediately in the app view (skip dashboard)
2. Chat starts clean with a system welcome message: "Your app is running. Send a message to make changes."
3. Preview shows the running application by auto-starting `npm run dev`
4. The interactive developer session is killed (with auto-commit) and replaced by a non-interactive simple-mode session

## Design

### Data Flow

```
StatusBar "Simple View" click
  → app:switch-mode('simple', projectId, sessionId)
  → main process:
      1. Kill interactive session (auto-commit changes first)
      2. Spawn non-interactive session (noWorktree, nonInteractive) on same project
      3. Start dev server (npm run dev) in project directory
      4. Subscribe chat adapter to new session
      5. Add system welcome message to chat
      6. Close window → create simple-mode window
      7. On did-finish-load: send app:auto-open-app(SimpleApp) to renderer
  → simple renderer App.tsx:
      1. Listen for app:auto-open-app event
      2. Set view directly to { kind: 'app', app } (skip dashboard)
      3. ChatPane shows welcome message
      4. PreviewPane subscribes for dev server URL
```

### Changes by File

| File | Change |
|------|--------|
| `src/renderer/components/StatusBar.tsx` | Pass projectId and sessionId to `app:switch-mode` |
| `src/main/index.ts` | Add `mode === 'simple'` branch in switch-mode handler |
| `src/main/session-manager.ts` | New `killInteractiveSession(sessionId)` method |
| `src/renderer-simple/App.tsx` | Listen for `app:auto-open-app`, jump to app view |
| `src/preload/simple.ts` | Add `app:auto-open-app` to listen whitelist |
| `src/main/chat-adapter.ts` | Add `addSystemMessage()` method |

### Session Lifecycle

1. Auto-commit: `git add -A && git commit` in the worktree
2. Kill: Kill PTY + dev server PTY, remove worktree
3. Spawn: New non-interactive session (noWorktree=true)
4. Dev server: `startDevServer()` on new session
5. Chat: System welcome message added via chat adapter

### SimpleApp Payload

```typescript
{
  sessionId: newSession.id,
  projectId,
  name: branchName.replace('manifold/', ''),
  description: taskDescription ?? '',
  status: 'building',
  previewUrl: null,
  liveUrl: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

## Approach Decision

Chose "Mirror the existing pattern" (Approach A) over "In-place session transfer" (Approach B) for consistency with the existing simple→developer switch and clean session type separation.
