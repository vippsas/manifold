# Unified Dockview Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hand-coded ProjectSidebar with a Dockview panel so the entire window is one unified drag-and-drop layout.

**Architecture:** Add `projects` as a 6th Dockview panel. Remove the sidebar infrastructure (resize hook, collapse toggle, divider). The default layout places Projects top-left, Files/Modified Files tabbed bottom-left, Agent center, Shell below Agent, Editor right.

**Tech Stack:** React, Dockview v5, Electron, TypeScript

---

### Task 1: Add ProjectsPanel to dock-panels.tsx

**Files:**
- Modify: `src/renderer/components/dock-panels.tsx`

**Step 1: Expand DockAppState with project fields**

In `dock-panels.tsx`, add the following fields to the `DockAppState` interface after the existing `onNewAgent` field:

```typescript
// Projects panel
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

Add the import at the top:

```typescript
import type { FileTreeNode, FileChange, Project, AgentSession } from '../../shared/types'
```

**Step 2: Add ProjectsPanel component**

Add after the `ShellPanel` function:

```typescript
function ProjectsPanel(): React.JSX.Element {
  const s = useDockState()
  return (
    <ProjectSidebar
      projects={s.projects}
      activeProjectId={s.activeProjectId}
      allProjectSessions={s.allProjectSessions}
      activeSessionId={s.sessionId}
      onSelectProject={s.onSelectProject}
      onSelectSession={s.onSelectSession}
      onAddProject={s.onAddProject}
      onRemoveProject={s.onRemoveProject}
      onUpdateProject={s.onUpdateProject}
      onCloneProject={s.onCloneProject}
      onDeleteAgent={s.onDeleteAgent}
      onNewAgent={s.onNewAgentForProject}
      onOpenSettings={s.onOpenSettings}
    />
  )
}
```

Add the import:

```typescript
import { ProjectSidebar } from './ProjectSidebar'
```

**Step 3: Register the panel**

Add `projects: ProjectsPanel` to the `PANEL_COMPONENTS` map:

```typescript
export const PANEL_COMPONENTS: Record<string, React.FC<any>> = {
  agent: AgentPanel,
  editor: EditorPanel,
  fileTree: FileTreePanel,
  modifiedFiles: ModifiedFilesPanel,
  shell: ShellPanel,
  projects: ProjectsPanel,
}
```

**Step 4: Commit**

```bash
git add src/renderer/components/dock-panels.tsx
git commit -m "feat: add ProjectsPanel as dockview panel component"
```

---

### Task 2: Remove width and onClose props from ProjectSidebar

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.tsx`

**Step 1: Remove width and onClose from props**

In `ProjectSidebar.tsx`, remove the `width` and `onClose` props from the `ProjectSidebarProps` interface and the destructured params. Also remove the `onClose` prop from `SidebarHeader`.

The interface becomes:

```typescript
interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  allProjectSessions: Record<string, AgentSession[]>
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (sessionId: string, projectId: string) => void
  onAddProject: (path?: string) => void
  onRemoveProject: (id: string) => void
  onUpdateProject: (id: string, partial: Partial<Omit<Project, 'id'>>) => void
  onCloneProject: (url: string) => void
  onDeleteAgent: (id: string) => void
  onNewAgent: (projectId: string) => void
  onOpenSettings: () => void
}
```

**Step 2: Update root div**

Change the root div from:

```tsx
<div className="layout-sidebar" style={{ ...sidebarStyles.root, width }}>
```

to:

```tsx
<div style={sidebarStyles.root}>
```

**Step 3: Remove collapse button from SidebarHeader**

Update the `SidebarHeader` function signature to remove `onClose`:

```typescript
function SidebarHeader({ onOpenSettings }: { onOpenSettings: () => void }): React.JSX.Element {
```

Remove the collapse button JSX (the `{onClose && (...)}` block).

Update the call site in `ProjectSidebar`:

```tsx
<SidebarHeader onOpenSettings={onOpenSettings} />
```

**Step 4: Commit**

```bash
git add src/renderer/components/ProjectSidebar.tsx
git commit -m "refactor: remove width and onClose props from ProjectSidebar"
```

---

### Task 3: Update useDockLayout with new panel and default layout

**Files:**
- Modify: `src/renderer/hooks/useDockLayout.ts`

**Step 1: Add `projects` to PANEL_IDS and PANEL_TITLES**

```typescript
const PANEL_IDS = ['projects', 'agent', 'editor', 'fileTree', 'modifiedFiles', 'shell'] as const

const PANEL_TITLES: Record<DockPanelId, string> = {
  projects: 'Projects',
  agent: 'Agent',
  editor: 'Editor',
  fileTree: 'Files',
  modifiedFiles: 'Modified Files',
  shell: 'Shell',
}
```

**Step 2: Replace buildDefaultLayout**

Replace the entire `buildDefaultLayout` callback with:

```typescript
const buildDefaultLayout = useCallback((api: DockviewApi) => {
  // Left top: Projects
  const projectsPanel = api.addPanel({
    id: 'projects',
    component: 'projects',
    title: PANEL_TITLES.projects,
  })

  // Left bottom: Files (tabbed with Modified Files)
  const filesPanel = api.addPanel({
    id: 'fileTree',
    component: 'fileTree',
    title: PANEL_TITLES.fileTree,
    position: { referencePanel: projectsPanel, direction: 'below' },
  })

  api.addPanel({
    id: 'modifiedFiles',
    component: 'modifiedFiles',
    title: PANEL_TITLES.modifiedFiles,
    position: { referencePanel: filesPanel, direction: 'within' },
  })

  // Center top: Agent
  const agentPanel = api.addPanel({
    id: 'agent',
    component: 'agent',
    title: PANEL_TITLES.agent,
    position: { referencePanel: projectsPanel, direction: 'right' },
  })

  // Center bottom: Shell
  api.addPanel({
    id: 'shell',
    component: 'shell',
    title: PANEL_TITLES.shell,
    position: { referencePanel: agentPanel, direction: 'below' },
  })

  // Right: Editor (full height)
  api.addPanel({
    id: 'editor',
    component: 'editor',
    title: PANEL_TITLES.editor,
    position: { referencePanel: agentPanel, direction: 'right' },
  })

  // Make Files the active tab in its group
  filesPanel.api.setActive()

  // Set relative sizes
  try {
    projectsPanel.group?.api.setSize({ width: 200 })
    const totalHeight = api.height
    if (totalHeight > 0) {
      api.getPanel('shell')?.group?.api.setSize({ height: Math.round(totalHeight / 3) })
    }
  } catch {
    // sizing is best-effort
  }
}, [])
```

**Step 3: Commit**

```bash
git add src/renderer/hooks/useDockLayout.ts
git commit -m "feat: add projects panel ID and new default layout with sidebar in dockview"
```

---

### Task 4: Update App.tsx to remove sidebar and wire projects into DockStateContext

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Remove sidebar imports and hooks**

Remove these imports:

```typescript
import { ProjectSidebar } from './components/ProjectSidebar'
import { useSidebarResize } from './hooks/useSidebarResize'
```

Remove these lines from the component body:

```typescript
const { sidebarWidth, handleSidebarDividerMouseDown } = useSidebarResize()
const [sidebarVisible, setSidebarVisible] = React.useState(true)
```

**Step 2: Add project fields to dockState**

Add to the `dockState` object (after `onNewAgent`):

```typescript
projects,
activeProjectId,
allProjectSessions: sessionsByProject,
onSelectProject: setActiveProject,
onSelectSession: overlays.handleSelectSession,
onAddProject: addProject,
onRemoveProject: removeProject,
onUpdateProject: updateProject,
onCloneProject: (url: string) => void cloneProject(url),
onDeleteAgent: overlays.handleDeleteAgent,
onNewAgentForProject: overlays.handleNewAgentForProject,
onOpenSettings: () => overlays.setShowSettings(true),
```

**Step 3: Replace the sidebar + layout-main JSX**

Replace the entire block from `{sidebarVisible ? (` through the closing of `layout-main` div. The new render return (inside the last `return` statement) becomes:

```tsx
return (
  <div className={`layout-root ${themeClass}`}>
    <div className="layout-main">
      <DockStateContext.Provider value={dockState}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <DockviewReact
            className="dockview-theme-dark dockview-theme-manifold"
            components={PANEL_COMPONENTS}
            onReady={(e) => dockLayout.onReady(e.api)}
            defaultTabComponent={DockTab}
            watermarkComponent={EmptyWatermark}
          />
        </div>
      </DockStateContext.Provider>

      <StatusBar
        activeSession={activeSession}
        changedFiles={mergedChanges}
        baseBranch={activeProject?.baseBranch ?? settings.defaultBaseBranch}
        dockLayout={dockLayout}
        conflicts={gitOps.conflicts}
        aheadBehind={gitOps.aheadBehind}
        onCommit={() => overlays.setActivePanel('commit')}
        onCreatePR={() => overlays.setActivePanel('pr')}
        onShowConflicts={() => overlays.setActivePanel('conflicts')}
      />
    </div>

    {/* overlays stay the same ... */}
```

Note: `sidebarVisible` and `onToggleSidebar` are removed from StatusBar props.

**Step 4: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire projects into DockStateContext and remove sidebar markup"
```

---

### Task 5: Simplify StatusBar to remove sidebar toggle

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`

**Step 1: Remove sidebar-specific props and logic**

Remove from `PANEL_LABELS`:

```typescript
// Remove the 'sidebar' key — it's no longer needed
```

The type becomes just `Record<DockPanelId, string>`.

Remove from `StatusBarProps`:

```typescript
sidebarVisible: boolean
onToggleSidebar: () => void
```

Remove from the destructured params: `sidebarVisible`, `onToggleSidebar`.

Remove the `showSidebarToggle` variable.

**Step 2: Simplify the toggle group render**

Replace the toggle group block:

```tsx
{hiddenDockPanels.length > 0 && (
  <span style={barStyles.toggleGroup}>
    {hiddenDockPanels.map((id) => (
      <button
        key={id}
        onClick={() => dockLayout.togglePanel(id)}
        style={barStyles.toggleButton}
        title={`Show ${PANEL_LABELS[id]}`}
      >
        {PANEL_LABELS[id]}
      </button>
    ))}
  </span>
)}
```

**Step 3: Commit**

```bash
git add src/renderer/components/StatusBar.tsx
git commit -m "refactor: remove sidebar toggle from StatusBar, use dock panel toggle for projects"
```

---

### Task 6: Clean up dead code and CSS

**Files:**
- Delete: `src/renderer/hooks/useSidebarResize.ts`
- Modify: `src/renderer/styles/theme.css`

**Step 1: Delete useSidebarResize.ts**

```bash
rm src/renderer/hooks/useSidebarResize.ts
```

**Step 2: Remove sidebar CSS from theme.css**

Remove these CSS rules from `theme.css`:

```css
.layout-sidebar { ... }
.sidebar-divider { ... }
.sidebar-divider:hover, .sidebar-divider.dragging { ... }
.sidebar-collapsed { ... }
.sidebar-collapsed:hover { ... }
.sidebar-collapsed-arrow { ... }
```

That's lines 116-157 approximately.

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove sidebar resize hook and sidebar CSS"
```

---

### Task 7: Typecheck and verify

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors. If there are errors, fix them (likely unused imports or missing fields).

**Step 2: Run tests**

```bash
npm test
```

Expected: All tests pass. If any test references `useSidebarResize` or old sidebar props, update them.

**Step 3: Run dev mode and visually verify**

```bash
npm run dev
```

Verify:
- Projects panel appears top-left
- Files and Modified Files appear tabbed bottom-left
- Agent center, Shell below agent, Editor right
- All panels are draggable to any position
- Closing a panel shows a toggle button in the status bar
- "Reset Layout" restores the default layout
- Layout persists across session switches

**Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address typecheck/test issues from dockview sidebar migration"
```
