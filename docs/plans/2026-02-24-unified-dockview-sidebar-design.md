# Unified Dockview Sidebar Design

## Summary

Replace the hand-coded ProjectSidebar with a Dockview panel so the entire window is one unified drag-and-drop layout. Files and Modified Files move to the sidebar by default.

## Current State

- Left sidebar: Hand-coded `ProjectSidebar` with manual resize (`useSidebarResize`) and collapse toggle
- Main area: `DockviewReact` with 5 panels (agent, editor, fileTree, modifiedFiles, shell)
- Two separate layout systems that cannot interact

## Design

### New `projects` panel

`ProjectSidebar` becomes the 6th Dockview panel. It renders the same UI but consumes props from `DockStateContext` instead of direct props.

### Default layout

```
Left column (~200px):
  Top:    PROJECTS
  Bottom: FILES | MODIFIED FILES (tabbed)

Middle column (largest):
  Top:    AGENT
  Bottom: SHELL

Right column:
  EDITOR (full height)
```

### Expanded DockStateContext

Add project-related fields to `DockAppState`:

```typescript
projects: Project[]
activeProjectId: string | null
allProjectSessions: Record<string, AgentSession[]>
onSelectProject: (id: string) => void
onSelectSession: (sessionId: string, projectId: string) => void
onAddProject: (path?: string) => void
onRemoveProject: (id: string) => void
onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
onCloneProject: (url: string) => void
onDeleteAgent: (id: string) => void
onNewAgentForProject: (projectId: string) => void
onOpenSettings: () => void
```

### Removed code

- `useSidebarResize` hook (deleted)
- `sidebarVisible` state and collapse/expand markup in `App.tsx`
- `sidebar-divider`, `sidebar-collapsed` CSS classes
- Special sidebar toggle in `StatusBar` (projects appears in `hiddenPanels` like any other panel)

### Files modified

| File | Change |
|------|--------|
| `dock-panels.tsx` | Add `ProjectsPanel`, expand `DockAppState` |
| `useDockLayout.ts` | Add `'projects'` to panel IDs, new default layout |
| `App.tsx` | Remove sidebar markup/state/hooks, add project fields to `dockState` |
| `StatusBar.tsx` | Remove sidebar-specific props and toggle logic |

### Files deleted

| File | Reason |
|------|--------|
| `useSidebarResize.ts` | No longer needed |
