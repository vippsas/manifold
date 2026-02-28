# Auto-start dev server when clicking an idle app card

## Problem

When a user clicks an existing app card in the simple view whose status is `idle`, the `AppView` opens but no dev server is running — there's no preview to show. The user has no way to start the app from this state.

## Solution

Auto-start the dev server when the user clicks an idle app card. A new IPC channel `agent:start-dev-server` calls the existing `startDevServerSession()` method. The renderer calls it before navigating to `AppView`, and the preview appears once the dev server outputs a localhost URL.

## Flow

1. User clicks idle app card on Dashboard
2. `App.tsx` `onSelectApp` calls `agent:start-dev-server` IPC with `{ projectId, branchName, description }`
3. Main process handler calls `sessionManager.startDevServerSession()` → spawns `npm run dev` → returns `{ sessionId }`
4. `SimpleApp` is updated with the new session ID
5. `AppViewWrapper` subscribes to the new session for chat and preview
6. `usePreview` picks up `preview:url-detected` once the dev server outputs a localhost URL
7. `PreviewPane` shows a spinner with "Starting app..." until the URL arrives

## Changes

| File | Change |
|---|---|
| `src/main/ipc/agent-handlers.ts` | Add `agent:start-dev-server` handler |
| `src/preload/simple.ts` | Whitelist `agent:start-dev-server` |
| `src/renderer-simple/App.tsx` | Call IPC on idle card click, update session ID |
| `src/renderer-simple/components/PreviewPane.tsx` | Add "Starting app..." spinner state |

## What stays the same

- `SessionManager.startDevServerSession()` — already exists
- `usePreview` hook — already listens for `preview:url-detected`
- `useChat` — works with any session ID
- Dashboard / AppCard components — unchanged
