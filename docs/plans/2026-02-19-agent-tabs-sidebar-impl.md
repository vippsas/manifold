# Agent Tabs in Sidebar — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move agent session tabs from the horizontal bar into ProjectSidebar, nested directly under each project.

**Architecture:** ProjectSidebar gains three new props (`activeSessionId`, `onSelectSession`, `onNewAgent`). The active project's agents render as indented list items below the project entry. AgentTabs component and `.layout-tab-bar` CSS class are removed. No hook/IPC/main-process changes.

**Tech Stack:** React, TypeScript, Vitest, @testing-library/react

---

### Task 1: Add agent item styles to ProjectSidebar.styles.ts

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.styles.ts`

**Step 1: Add agent styles**

Add these entries to the `sidebarStyles` object after the existing `removeButton` entry (line 72):

```typescript
  agentItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px 4px 28px',
    cursor: 'pointer',
    borderRadius: '4px',
    margin: '1px 4px',
    transition: 'background 0.1s ease',
    fontSize: '12px',
  },
  agentBranch: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  },
  agentRuntime: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  newAgentButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 12px 4px 28px',
    fontSize: '11px',
    color: 'var(--accent)',
    cursor: 'pointer',
  },
```

**Step 2: Commit**

```bash
git add src/renderer/components/ProjectSidebar.styles.ts
git commit -m "style: add agent item styles to ProjectSidebar"
```

---

### Task 2: Write failing tests for agent rendering in ProjectSidebar

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.test.tsx`

**Step 1: Update renderSidebar helper to include new props**

In `ProjectSidebar.test.tsx`, update the `defaultProps` inside `renderSidebar` (around line 33-43) to include the three new props:

```typescript
function renderSidebar(overrides = {}) {
  const defaultProps = {
    projects: sampleProjects,
    activeProjectId: 'p1',
    sessions: sampleSessions,
    activeSessionId: 's1',
    onSelectProject: vi.fn(),
    onSelectSession: vi.fn(),
    onAddProject: vi.fn(),
    onRemoveProject: vi.fn(),
    onNewAgent: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  }

  return { ...render(<ProjectSidebar {...defaultProps} />), props: defaultProps }
}
```

**Step 2: Add tests for agent items under active project**

Append these tests inside the existing `describe('ProjectSidebar', ...)` block:

```typescript
  it('renders agent branch names under the active project', () => {
    renderSidebar()

    expect(screen.getByText('oslo')).toBeInTheDocument()
    expect(screen.getByText('bergen')).toBeInTheDocument()
  })

  it('renders agent runtime labels', () => {
    renderSidebar()

    expect(screen.getByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
  })

  it('calls onSelectSession when an agent item is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('bergen'))

    expect(props.onSelectSession).toHaveBeenCalledWith('s2')
  })

  it('renders + New Agent button under active project', () => {
    renderSidebar()

    expect(screen.getByText('+ New Agent')).toBeInTheDocument()
  })

  it('calls onNewAgent when + New Agent is clicked', () => {
    const { props } = renderSidebar()

    fireEvent.click(screen.getByText('+ New Agent'))

    expect(props.onNewAgent).toHaveBeenCalled()
  })

  it('highlights the active agent item', () => {
    renderSidebar({ activeSessionId: 's1' })

    const agentButton = screen.getByTitle('Claude - manifold/oslo')
    expect(agentButton.style.background).toContain('var(--bg-input)')
  })

  it('does not show agents for non-active projects', () => {
    const sessionsForP2: AgentSession[] = [
      { id: 's3', projectId: 'p2', runtimeId: 'gemini', branchName: 'manifold/stavanger', worktreePath: '/wt3', status: 'running', pid: 3 },
    ]

    renderSidebar({ sessions: [...sampleSessions, ...sessionsForP2] })

    // p2 agents should not appear since p1 is active
    expect(screen.queryByText('stavanger')).not.toBeInTheDocument()
  })

  it('hides session count badge for the active project', () => {
    renderSidebar()

    // Active project p1 shows agents inline, not a count badge
    // Beta (p2) has 0 sessions so no badge either
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/ProjectSidebar.test.tsx`
Expected: FAIL — new props don't exist on the component yet, agent text not found

**Step 4: Commit failing tests**

```bash
git add src/renderer/components/ProjectSidebar.test.tsx
git commit -m "test: add failing tests for agent items in ProjectSidebar"
```

---

### Task 3: Implement agent rendering in ProjectSidebar

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.tsx`

**Step 1: Add new props to the interface**

Update `ProjectSidebarProps` (line 5-13) to add three new props:

```typescript
interface ProjectSidebarProps {
  projects: Project[]
  activeProjectId: string | null
  sessions: AgentSession[]
  activeSessionId: string | null
  onSelectProject: (id: string) => void
  onSelectSession: (id: string) => void
  onAddProject: (path?: string) => void
  onRemoveProject: (id: string) => void
  onNewAgent: () => void
  onOpenSettings: () => void
}
```

**Step 2: Destructure new props in ProjectSidebar**

Update the destructuring (line 15-23):

```typescript
export function ProjectSidebar({
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  onSelectProject,
  onSelectSession,
  onAddProject,
  onRemoveProject,
  onNewAgent,
  onOpenSettings,
}: ProjectSidebarProps): React.JSX.Element {
```

**Step 3: Pass new props to ProjectList**

Update the `<ProjectList>` call (around line 61-67) to pass agent-related props:

```typescript
      <ProjectList
        projects={projects}
        activeProjectId={activeProjectId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        getSessionCount={getSessionCount}
        onSelectProject={onSelectProject}
        onSelectSession={onSelectSession}
        onNewAgent={onNewAgent}
        onRemove={handleRemove}
      />
```

**Step 4: Update ProjectList to accept and forward agent props**

Update the `ProjectListProps` interface and component:

```typescript
interface ProjectListProps {
  projects: Project[]
  activeProjectId: string | null
  sessions: AgentSession[]
  activeSessionId: string | null
  getSessionCount: (id: string) => number
  onSelectProject: (id: string) => void
  onSelectSession: (id: string) => void
  onNewAgent: () => void
  onRemove: (e: React.MouseEvent, id: string) => void
}

function ProjectList({
  projects,
  activeProjectId,
  sessions,
  activeSessionId,
  getSessionCount,
  onSelectProject,
  onSelectSession,
  onNewAgent,
  onRemove,
}: ProjectListProps): React.JSX.Element {
  return (
    <div style={sidebarStyles.list}>
      {projects.map((project) => {
        const isActive = project.id === activeProjectId
        const projectSessions = isActive
          ? sessions.filter((s) => s.projectId === project.id)
          : []

        return (
          <React.Fragment key={project.id}>
            <ProjectItem
              project={project}
              isActive={isActive}
              sessionCount={isActive ? 0 : getSessionCount(project.id)}
              onSelect={onSelectProject}
              onRemove={onRemove}
            />
            {isActive && projectSessions.map((session) => (
              <AgentItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onSelect={onSelectSession}
              />
            ))}
            {isActive && (
              <button onClick={onNewAgent} style={sidebarStyles.newAgentButton}>
                + New Agent
              </button>
            )}
          </React.Fragment>
        )
      })}
      {projects.length === 0 && (
        <div style={sidebarStyles.empty}>No projects yet</div>
      )}
    </div>
  )
}
```

**Step 5: Add AgentItem component**

Add this new component after the `ProjectItem` component (around line 181):

```typescript
const RUNTIME_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  custom: 'Custom',
}

function formatBranch(branchName: string): string {
  return branchName.replace('manifold/', '')
}

function runtimeLabel(runtimeId: string): string {
  return RUNTIME_LABELS[runtimeId] ?? runtimeId
}

interface AgentItemProps {
  session: AgentSession
  isActive: boolean
  onSelect: (id: string) => void
}

function AgentItem({ session, isActive, onSelect }: AgentItemProps): React.JSX.Element {
  const handleClick = useCallback((): void => {
    onSelect(session.id)
  }, [onSelect, session.id])

  return (
    <button
      onClick={handleClick}
      style={{
        ...sidebarStyles.agentItem,
        background: isActive ? 'var(--bg-input)' : 'transparent',
      }}
      title={`${runtimeLabel(session.runtimeId)} - ${session.branchName}`}
    >
      <span className={`status-dot status-dot--${session.status}`} />
      <span className="truncate" style={sidebarStyles.agentBranch}>
        {formatBranch(session.branchName)}
      </span>
      <span style={sidebarStyles.agentRuntime}>{runtimeLabel(session.runtimeId)}</span>
    </button>
  )
}
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/ProjectSidebar.test.tsx`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/renderer/components/ProjectSidebar.tsx
git commit -m "feat: render agent sessions under active project in sidebar"
```

---

### Task 4: Wire up App.tsx and remove AgentTabs

**Files:**
- Modify: `src/renderer/App.tsx`

**Step 1: Remove AgentTabs import**

Delete line 11:
```typescript
import { AgentTabs } from './components/AgentTabs'
```

**Step 2: Pass new props to ProjectSidebar**

Update the `<ProjectSidebar>` JSX (lines 49-57) to include agent props:

```typescript
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectProject={setActiveProject}
        onSelectSession={setActiveSession}
        onAddProject={addProject}
        onRemoveProject={removeProject}
        onNewAgent={() => setShowNewAgent(true)}
        onOpenSettings={() => setShowSettings(true)}
      />
```

**Step 3: Remove AgentTabs from layout-main**

Delete the `<AgentTabs>` block (lines 60-65):

```typescript
        <AgentTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSession}
          onNewAgent={() => setShowNewAgent(true)}
        />
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (AgentTabs tests will still pass because the component file still exists, but it's no longer used in App)

**Step 5: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat: wire agent props to ProjectSidebar, remove AgentTabs from layout"
```

---

### Task 5: Clean up — delete AgentTabs and remove CSS

**Files:**
- Delete: `src/renderer/components/AgentTabs.tsx`
- Delete: `src/renderer/components/AgentTabs.test.tsx`
- Modify: `src/renderer/styles/theme.css`

**Step 1: Delete AgentTabs files**

```bash
rm src/renderer/components/AgentTabs.tsx src/renderer/components/AgentTabs.test.tsx
```

**Step 2: Remove `.layout-tab-bar` from theme.css**

Delete lines 162-172 from `src/renderer/styles/theme.css`:

```css
.layout-tab-bar {
  height: var(--tab-bar-height);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 var(--space-sm);
  gap: var(--space-xs);
}
```

Also remove `--tab-bar-height: 36px;` from the `:root` block (line 18).

**Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (fewer tests total now that AgentTabs tests are deleted)

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete AgentTabs component and unused tab bar CSS"
```

---

### Task 6: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Build the app**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Visual check**

Run: `npm run dev`
Verify: Sidebar shows agents nested under active project, no horizontal tab bar, main panes use full height.
