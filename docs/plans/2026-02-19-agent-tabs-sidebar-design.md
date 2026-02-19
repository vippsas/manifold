# Agent Tabs in Sidebar Design

**Date:** 2026-02-19
**Status:** Approved

## Summary

Move agent session tabs from the horizontal bar at the top of `layout-main` into the left `ProjectSidebar`, nested directly beneath each project. Agents for the active project expand inline; non-active projects remain collapsed showing only a session count badge.

## Current Layout

```
┌──────────┬──────────────────────────────────────┐
│ Projects │  [Agent Tab 1] [Agent Tab 2] [+ New] │
│          ├──────────────────────────────────────┤
│  repo-1  │  Terminal  │  CodeViewer  │  Files   │
│  repo-2  │           │             │          │
│          ├──────────────────────────────────────┤
│ +Add  Cl │  StatusBar                           │
└──────────┴──────────────────────────────────────┘
```

## Target Layout

```
┌──────────┬──────────────────────────────────────┐
│ Projects │                                      │
│  repo-1  │  Terminal  │  CodeViewer  │  Files   │
│    ● a1  │           │             │          │
│    ● a2  │           │             │          │
│    + New │           │             │          │
│  repo-2  │           │             │          │
│──────────├──────────────────────────────────────┤
│ +Add  Cl │  StatusBar                           │
└──────────┴──────────────────────────────────────┘
```

## Behavior

- Click a project to select it — its agents expand beneath it
- Click an agent to make it the active session
- "+ New Agent" appears as last item under active project's agents
- Non-active projects show project name + session count badge (unchanged)

## Components Affected

| File | Change |
|------|--------|
| `App.tsx` | Remove `<AgentTabs>` from `layout-main`; pass `onSelectSession`, `onNewAgent`, `activeSessionId` to `ProjectSidebar` |
| `ProjectSidebar.tsx` | Render agent items under active project; accept new props |
| `ProjectSidebar.styles.ts` | Add styles for nested agent items (indented, status dot, branch, runtime) |
| `theme.css` | Remove `--tab-bar-height` usage from `layout-tab-bar`; remove `.layout-tab-bar` class |
| `AgentTabs.tsx` | Delete (no longer rendered) |

## No Changes To

- MainPanes, TerminalPane, CodeViewer, FileTree
- Hooks (useAgentSession, usePaneResize, etc.)
- Main process, IPC handlers
- Non-UI tests
