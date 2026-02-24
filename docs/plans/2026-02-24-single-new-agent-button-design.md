# Single "New Agent" Button in Sidebar Header

## Problem

Each project in the sidebar has its own "+ New Agent" button, creating visual clutter. We want a single entry point for creating agents.

## Design

### UI Change

- Remove per-project "+ New Agent" buttons from the sidebar project list.
- Add one "+ New Agent" accent-colored text button in the sidebar header, next to "PROJECTS" and the settings gear icon.

### Flow

1. User clicks "+ New Agent" in sidebar header.
2. OnboardingView "no-agent" overlay opens (full-screen, simple task description input + "Start" button).
3. User types task description, clicks "Start".
4. NewTaskModal opens with project dropdown (always shown), runtime picker, and branch/PR picker.
5. User selects project, configures options, clicks "Launch".

### Files Touched

| File | Change |
|------|--------|
| `ProjectSidebar.tsx` | Remove per-project "+ New Agent" buttons; add single button in header |
| `ProjectSidebar.styles.ts` | Add header button style; remove `newAgentButton` if unused |
| `useAppOverlays.ts` | Adjust handler so button works without a pre-selected projectId |
| `App.tsx` | Ensure OnboardingView overlay renders when triggered from header button |
| `dock-panels.tsx` | Wire new button prop through |

### What Stays the Same

- `NewTaskModal` (already supports project picker mode)
- `OnboardingView` "no-agent" variant (reused as-is)
- `useAgentSession.spawnAgent` (unchanged)
- All IPC and main process code (unchanged)
