# Global Agent Storage Design

**Date:** 2026-02-20
**Status:** Approved

## Problem

Agents (worktrees) are stored inside each project at `<project>/.manifold/worktrees/`. This pollutes project directories and ties storage to project location. Users should choose where to store all agents globally.

## Decision

Move agent worktree storage from project-local to a user-chosen global directory (default `~/.manifold/`). On first launch, show a welcome dialog for the user to confirm or change the storage path.

## Design

### Data Model

Add two fields to `ManifoldSettings`:

```typescript
export interface ManifoldSettings {
  storagePath: string       // default: ~/.manifold/
  setupCompleted: boolean   // default: false
  defaultRuntime: string
  theme: 'dark' | 'light'
  scrollbackLines: number
  defaultBaseBranch: string
}
```

### Worktree Path Resolution

**Before:** `<projectPath>/.manifold/worktrees/<branch-safe-name>/`
**After:** `<storagePath>/worktrees/<projectId>/<branch-safe-name>/`

`WorktreeManager` changes:
- Constructor accepts `storagePath` parameter
- `getWorktreeBase(projectId)` returns `path.join(storagePath, 'worktrees', projectId)`
- All methods use `projectId` instead of `projectPath` for base directory computation
- `projectPath` is still needed for `simpleGit` operations (the actual git repo)

### Welcome Dialog

New `WelcomeDialog` component shown when `settings.setupCompleted === false`:
- Modal overlay (same pattern as SettingsModal)
- Title: "Welcome to Manifold"
- Text input pre-filled with expanded `~/.manifold/`
- "Browse" button opens native folder picker via existing `projects:open-dialog` IPC
- "Continue" button saves `storagePath` + sets `setupCompleted = true`
- Blocks rest of UI until completed

### Settings Modal

Add `storagePath` field to existing SettingsModal. Changing it only affects new agents.

### Migration

Clean start. Existing project-local worktrees are not migrated. Users clean up old `.manifold/` folders manually.

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `storagePath`, `setupCompleted` to `ManifoldSettings` |
| `src/shared/defaults.ts` | Add default values |
| `src/main/worktree-manager.ts` | Accept `storagePath`, use `projectId` for base path |
| `src/main/worktree-manager.test.ts` | Update test paths |
| `src/main/session-manager.ts` | Pass `storagePath` to worktree manager |
| `src/main/session-manager.test.ts` | Update test paths |
| `src/main/ipc-handlers.ts` | Thread `storagePath` from settings |
| `src/main/index.ts` | Pass `storagePath` when constructing WorktreeManager |
| `src/renderer/components/WelcomeDialog.tsx` | New: first-launch welcome dialog |
| `src/renderer/App.tsx` | Show WelcomeDialog when `!setupCompleted` |
| `src/renderer/components/SettingsModal.tsx` | Add storagePath field |
| `src/main/settings-store.ts` | No changes needed (generic) |
| `src/main/settings-store.test.ts` | Update default expectations |
