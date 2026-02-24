# Single "New Agent" Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-project "+ New Agent" buttons with a single "+ New Agent" button in the sidebar header that opens the onboarding overlay, then the NewTaskModal with a project picker.

**Architecture:** Move the new-agent trigger from per-project scope to a global header action. The existing `handleNewAgentWithDescription` flow already supports project picking — we reuse it. The OnboardingView "no-agent" overlay is rendered in App.tsx (like the "no-project" onboarding) and triggered by a new `showAgentOnboarding` state.

**Tech Stack:** React, TypeScript, Electron renderer process

---

### Task 1: Add `onNewAgent` callback prop to `SidebarHeader` and render the button

**Files:**
- Modify: `src/renderer/components/ProjectSidebar.tsx:17,46,68-84`
- Modify: `src/renderer/components/ProjectSidebar.styles.ts:9-15`

**Step 1: Add `onNewAgent` prop to `ProjectSidebarProps` and `SidebarHeader`**

In `ProjectSidebar.tsx`, add `onNewAgent` callback (no projectId — it's global now) to the interface and pass it to `SidebarHeader`:

```typescript
// ProjectSidebarProps — change line 17 from:
onNewAgent: (projectId: string) => void
// to:
onNewAgent: () => void
```

Update `SidebarHeader` to accept and render the button:

```typescript
function SidebarHeader({ onNewAgent, onOpenSettings }: { onNewAgent: () => void; onOpenSettings: () => void }): React.JSX.Element {
  return (
    <div style={sidebarStyles.header}>
      <span style={sidebarStyles.title}>Projects</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={onNewAgent}
          style={sidebarStyles.headerNewAgent}
          title="New Agent"
        >
          + New Agent
        </button>
        <button
          onClick={onOpenSettings}
          style={sidebarStyles.gearButton}
          aria-label="Settings"
          title="Settings"
        >
          &#9881;
        </button>
      </span>
    </div>
  )
}
```

Update the call site in `ProjectSidebar` (line 46):

```typescript
<SidebarHeader onNewAgent={onNewAgent} onOpenSettings={onOpenSettings} />
```

**Step 2: Add `headerNewAgent` style**

In `ProjectSidebar.styles.ts`, add after `gearButton` (line 28):

```typescript
headerNewAgent: {
  fontSize: '11px',
  color: 'var(--accent)',
  cursor: 'pointer',
  padding: '2px 4px',
  whiteSpace: 'nowrap' as const,
},
```

**Step 3: Remove per-project "+ New Agent" buttons**

In `ProjectSidebar.tsx`, delete lines 135-137 (the per-project button):

```typescript
// DELETE this block:
<button onClick={() => onNewAgent(project.id)} style={sidebarStyles.newAgentButton}>
  + New Agent
</button>
```

Also remove `onNewAgent` from `ProjectListProps` (line 94) and the `ProjectList` function parameter (line 107), since it's no longer used there.

**Step 4: Clean up unused `newAgentButton` style**

In `ProjectSidebar.styles.ts`, delete the `newAgentButton` entry (lines 99-107).

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: Errors in `dock-panels.tsx` because the `onNewAgent` prop type changed from `(projectId: string) => void` to `() => void`. That's expected — we fix it in Task 2.

**Step 6: Commit**

```bash
git add src/renderer/components/ProjectSidebar.tsx src/renderer/components/ProjectSidebar.styles.ts
git commit -m "feat: move New Agent button to sidebar header, remove per-project buttons"
```

---

### Task 2: Wire the new button through dock-panels and App.tsx to show the onboarding overlay

**Files:**
- Modify: `src/renderer/components/dock-panels.tsx:52,155-171`
- Modify: `src/renderer/App.tsx:112,142-178,269-280,304-316`
- Modify: `src/renderer/hooks/useAppOverlays.ts:4-26,71-76,101-123`

**Step 1: Add `showAgentOnboarding` state and handler to `useAppOverlays`**

In `useAppOverlays.ts`, add state and handler:

```typescript
const [showAgentOnboarding, setShowAgentOnboarding] = useState(false)

const handleNewAgentFromHeader = useCallback((): void => {
  setShowAgentOnboarding(true)
}, [])
```

Update `handleNewAgentWithDescription` to close the onboarding overlay when opening the modal:

```typescript
const handleNewAgentWithDescription = useCallback((description: string): void => {
  setInitialDescription(description)
  setShowProjectPicker(true)
  setShowNewAgent(true)
  setShowAgentOnboarding(false)
}, [])
```

Add `showAgentOnboarding`, `setShowAgentOnboarding`, and `handleNewAgentFromHeader` to the `UseAppOverlaysResult` interface and return object.

**Step 2: Update `DockAppState` and `ProjectsPanel` in `dock-panels.tsx`**

In `dock-panels.tsx`, change the `onNewAgentForProject` field in `DockAppState` (line 52) to:

```typescript
onNewAgent: () => void  // replaces onNewAgentForProject
```

(Keep the existing `onNewAgent: (description: string) => void` for the AgentPanel onboarding — rename it to `onNewAgentWithDescription` to avoid collision.)

Updated `DockAppState`:
```typescript
// Line 42 — rename for clarity:
onNewAgentWithDescription: (description: string) => void
// Line 52 — replace:
onNewAgentFromHeader: () => void
```

Update `AgentPanel` (line 78):
```typescript
return <OnboardingView variant="no-agent" onNewAgent={s.onNewAgentWithDescription} />
```

Update `ProjectsPanel` (line 168):
```typescript
onNewAgent={s.onNewAgentFromHeader}
```

**Step 3: Update `dockState` in `App.tsx`**

In `App.tsx`, update the dockState object (around line 166-177):

```typescript
onNewAgentWithDescription: (description: string) => { overlays.handleNewAgentWithDescription(description) },
// ...
onNewAgentFromHeader: overlays.handleNewAgentFromHeader,
```

**Step 4: Render the agent onboarding overlay in `App.tsx`**

After the existing `showOnboarding` block (line 304-316), add:

```typescript
{overlays.showAgentOnboarding && (
  <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-primary)' }}>
    <OnboardingView
      variant="no-agent"
      onNewAgent={overlays.handleNewAgentWithDescription}
      onBack={() => overlays.setShowAgentOnboarding(false)}
    />
  </div>
)}
```

**Step 5: Add `onBack` prop to the "no-agent" variant of `OnboardingView`**

In `OnboardingView.tsx`, update the `NoAgentProps` interface (line 37-39):

```typescript
interface NoAgentProps {
  variant: 'no-agent'
  onNewAgent: (description: string) => void
  onBack?: () => void
}
```

Render the back button when `onBack` is provided (after the `NewTaskInput`, inside the "no-agent" branch around line 90-92):

```typescript
) : (
  <>
    <NewTaskInput onNewAgent={props.onNewAgent} />
    {props.onBack && (
      <button
        onClick={props.onBack}
        style={{
          marginTop: 8,
          padding: '6px 16px',
          fontSize: 12,
          color: 'var(--text-muted)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Back to workspace
      </button>
    )}
  </>
)}
```

**Step 6: Ensure NewTaskModal always shows project picker when coming from onboarding**

The existing logic already handles this: `handleNewAgentWithDescription` sets `showProjectPicker: true`, and `NewTaskModal` renders `ProjectDropdown` when `projects` is passed and `projects.length > 1`. No changes needed here — but if there's only 1 project, it auto-selects it (which is correct).

**Step 7: Run typecheck and dev**

Run: `npm run typecheck`
Expected: PASS — all types align.

Run: `npm run dev`
Expected: App starts, single "+ New Agent" button visible in sidebar header, clicking opens onboarding overlay, typing description and clicking Start opens NewTaskModal with project picker.

**Step 8: Commit**

```bash
git add src/renderer/components/dock-panels.tsx src/renderer/components/OnboardingView.tsx src/renderer/hooks/useAppOverlays.ts src/renderer/App.tsx
git commit -m "feat: wire single New Agent button to onboarding overlay with project picker"
```
