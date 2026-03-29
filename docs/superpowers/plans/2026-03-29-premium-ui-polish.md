# Premium UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate Manifold's visual quality with gradient buttons, glowing focus rings, thinner scrollbars, backdrop blur, smooth transitions, and a restructured sidebar with project grouping and agent cards.

**Architecture:** All changes are CSS-first — most tasks only touch `theme.css`. Two tasks modify React components (`ProjectSidebar.tsx`, `AgentItem.tsx`) to add wrapper elements and CSS classes. The style primitive file (`workbench-style-primitives.ts`) gets backdrop-filter added to modal overlays.

**Tech Stack:** CSS custom properties, React (JSX structure only — no new state/hooks), vitest for regression

---

## File Map

| File | Changes |
|------|---------|
| `src/renderer/styles/theme.css` | Tasks 1-6: gradient buttons, focus glow, scrollbar, transitions, sidebar CSS |
| `src/renderer/components/workbench-style-primitives.ts` | Task 3: backdrop-filter on overlay |
| `src/renderer/components/sidebar/ProjectSidebar.tsx` | Task 5: wrap project+agents in group div |
| `src/renderer/components/sidebar/AgentItem.tsx` | Task 6: add status-border class |
| `src/renderer/components/sidebar/ProjectSidebar.styles.ts` | No changes needed |

---

### Task 1: Gradient Buttons

Apply a subtle diagonal gradient to all primary buttons (`.git-panel-btn--primary`, `.sidebar-action-button--primary`, dialog `primaryButton`) and add a brightness hover effect.

**Files:**
- Modify: `src/renderer/styles/theme.css:559-563` (sidebar action button), `src/renderer/styles/theme.css:897-904` (git panel btn)
- Modify: `src/renderer/components/workbench-style-primitives.ts:95-103` (dialog primaryButton)

- [ ] **Step 1: Add gradient to `.sidebar-action-button--primary` in theme.css**

In `src/renderer/styles/theme.css`, replace the existing `.sidebar-action-button--primary` block:

```css
.sidebar-action-button--primary {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: transparent;
}
```

with:

```css
.sidebar-action-button--primary {
  color: var(--btn-text);
  background: linear-gradient(135deg, var(--btn-bg), var(--btn-hover));
  border-color: transparent;
  font-weight: 600;
  transition: filter 200ms ease;
}

.sidebar-action-button--primary:hover {
  filter: brightness(1.12);
}
```

- [ ] **Step 2: Add gradient to `.git-panel-btn--primary` in theme.css**

In `src/renderer/styles/theme.css`, replace:

```css
.git-panel-btn--primary {
  background: var(--btn-bg);
  color: var(--btn-text);
}

.git-panel-btn--primary:hover:not(:disabled) {
  background: var(--btn-hover);
}
```

with:

```css
.git-panel-btn--primary {
  background: linear-gradient(135deg, var(--btn-bg), var(--btn-hover));
  color: var(--btn-text);
  transition: filter 200ms ease;
}

.git-panel-btn--primary:hover:not(:disabled) {
  filter: brightness(1.12);
}
```

- [ ] **Step 3: Add gradient to dialog primaryButton in workbench-style-primitives.ts**

In `src/renderer/components/workbench-style-primitives.ts`, update the `primaryButton` object (around line 95):

```typescript
  primaryButton: {
    minHeight: 'var(--control-height)',
    padding: '0 calc(var(--space-md) + 2px)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--type-ui)',
    color: 'var(--btn-text)',
    background: 'linear-gradient(135deg, var(--btn-bg), var(--btn-hover))',
    fontWeight: 500,
    transition: 'filter 200ms ease',
  },
```

- [ ] **Step 4: Run tests to verify no regressions**

Run: `npm run typecheck && npm test`
Expected: All tests pass (28 pre-existing failures from better-sqlite3 are expected and unrelated).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/theme.css src/renderer/components/workbench-style-primitives.ts
git commit -m "feat: gradient buttons on all primary actions"
```

---

### Task 2: Focus Ring Glow

Replace the hard 1px outline on focus-visible elements with a soft accent-colored glow using box-shadow.

**Files:**
- Modify: `src/renderer/styles/theme.css:301-308` (focus-visible rules)

- [ ] **Step 1: Update the focus-visible rule in theme.css**

In `src/renderer/styles/theme.css`, replace:

```css
button:focus-visible,
[role='button']:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 1px solid var(--focus-ring);
  outline-offset: -1px;
}
```

with:

```css
button:focus-visible,
[role='button']:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle);
}
```

- [ ] **Step 2: Update sidebar item focus-visible**

In `src/renderer/styles/theme.css`, replace:

```css
.sidebar-item-row:focus-visible {
  outline: 1px solid var(--focus-ring);
  outline-offset: -1px;
}
```

with:

```css
.sidebar-item-row:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle);
}
```

- [ ] **Step 3: Update file tree row focus-visible**

In `src/renderer/styles/theme.css`, replace:

```css
.file-tree-row:focus-visible {
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}
```

with:

```css
.file-tree-row:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 10px var(--accent-subtle);
}
```

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: soft glow focus rings on all interactive elements"
```

---

### Task 3: Scrollbar Refinement + Backdrop Blur

Thinner scrollbars (8px → 6px) and frosted glass backdrop on modal overlays.

**Files:**
- Modify: `src/renderer/styles/theme.css:135-151` (scrollbar rules)
- Modify: `src/renderer/components/workbench-style-primitives.ts:6-14` (overlay style)

- [ ] **Step 1: Update scrollbar width and border-radius in theme.css**

In `src/renderer/styles/theme.css`, replace:

```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}
```

with:

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}
```

- [ ] **Step 2: Add backdrop-filter to dialog overlay in workbench-style-primitives.ts**

In `src/renderer/components/workbench-style-primitives.ts`, update the `overlay` object in `dialogPrimitives`:

```typescript
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--overlay-backdrop)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
```

Note: `WebkitBackdropFilter` is needed for Electron's Chromium. The `React.CSSProperties` type accepts it as a valid property.

- [ ] **Step 3: Run tests**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/theme.css src/renderer/components/workbench-style-primitives.ts
git commit -m "feat: thinner scrollbars and frosted glass modal backdrop"
```

---

### Task 4: Micro-Interactions + Transitions

Add smooth CSS transitions to interactive sidebar rows, file tree rows, and buttons. This makes hover/active state changes feel premium instead of instant.

**Files:**
- Modify: `src/renderer/styles/theme.css`

- [ ] **Step 1: Add transition to sidebar rows**

In `src/renderer/styles/theme.css`, in the `.sidebar-item-row` rule (around line 428), add a transition property. Replace:

```css
.sidebar-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-height: var(--chrome-row-height);
  margin: 1px 8px;
  padding: 0 12px 0 11px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  position: relative;
  cursor: pointer;
}
```

with:

```css
.sidebar-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  min-height: var(--chrome-row-height);
  margin: 1px 8px;
  padding: 0 12px 0 11px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  position: relative;
  cursor: pointer;
  transition: background 150ms ease, color 150ms ease, box-shadow 150ms ease;
}
```

- [ ] **Step 2: Add transition to file tree rows**

In `src/renderer/styles/theme.css`, update `.file-tree-row:hover` (around line 987). Add a base rule before the hover rule:

Insert immediately before the `.file-tree-row:hover` line:

```css
.file-tree-row {
  transition: background 150ms ease;
}
```

- [ ] **Step 3: Add transition to sidebar icon buttons**

In `src/renderer/styles/theme.css`, update `.sidebar-icon-button` (around line 538). Replace:

```css
.sidebar-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  opacity: 0.75;
}
```

with:

```css
.sidebar-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: var(--radius-xs);
  color: var(--text-muted);
  opacity: 0.75;
  transition: opacity 150ms ease, color 150ms ease, background 150ms ease;
}
```

- [ ] **Step 4: Add transition to git panel buttons**

In `src/renderer/styles/theme.css`, update `.git-panel-btn` (around line 883). Replace:

```css
.git-panel-btn {
  font-size: var(--type-ui-small);
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  font-weight: 500;
}
```

with:

```css
.git-panel-btn {
  font-size: var(--type-ui-small);
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  font-weight: 500;
  transition: filter 200ms ease, background 150ms ease, color 150ms ease;
}
```

- [ ] **Step 5: Run tests**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/styles/theme.css
git commit -m "feat: smooth transitions on all interactive elements"
```

---

### Task 5: Sidebar Project Grouping

Wrap each project and its agents in a visual group container. Projects with agents get a card-like elevated background. Empty projects get quieter styling. Add a small gap between groups.

**Files:**
- Modify: `src/renderer/components/sidebar/ProjectSidebar.tsx:179-204` (ProjectList render)
- Modify: `src/renderer/components/sidebar/ProjectSidebar.styles.ts` (add group style)
- Modify: `src/renderer/styles/theme.css` (add group CSS classes)

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: All tests pass.

- [ ] **Step 2: Add group CSS classes to theme.css**

In `src/renderer/styles/theme.css`, add the following rules after the `.sidebar-secondary-text` block (around line 522):

```css
.sidebar-project-group {
  margin-bottom: 2px;
}

.sidebar-project-group--has-agents {
  margin: 4px 6px;
  padding: 2px 0;
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--divider);
}

.sidebar-project-group--has-agents .sidebar-item-row {
  margin-left: 4px;
  margin-right: 4px;
}

.sidebar-project-group--empty .sidebar-project-row {
  color: var(--text-muted);
  font-weight: 500;
}
```

- [ ] **Step 3: Update the repo header typography for premium feel**

In `src/renderer/styles/theme.css`, update `.sidebar-project-row` (around line 458). Replace:

```css
.sidebar-project-row {
  font-weight: 600;
  padding-right: 68px;
}
```

with:

```css
.sidebar-project-row {
  font-weight: 600;
  padding-right: 68px;
  font-size: var(--type-ui-small);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
```

- [ ] **Step 4: Wrap project + agents in a group div in ProjectSidebar.tsx**

In `src/renderer/components/sidebar/ProjectSidebar.tsx`, in the `ProjectList` component, replace the `projects.map` return block (lines 179-204):

```tsx
        return (
          <React.Fragment key={project.id}>
            <ProjectItem
              project={project}
              isActive={isActive}
              onSelect={handleProjectClick}
              onRemove={onRemove}
              onUpdateProject={onUpdateProject}
              isFetching={fetchingProjectId === project.id}
              fetchResult={lastFetchedProjectId === project.id ? fetchResult : null}
              fetchError={lastFetchedProjectId === project.id ? fetchError : null}
              onFetch={() => onFetchProject(project.id)}
            />
            {projectSessions.map((session) => (
              <AgentItem
                key={session.id}
                session={session}
                projectPath={project.path}
                isActive={session.id === activeSessionId}
                onSelect={(sessionId) => onSelectSession(sessionId, project.id)}
                onDelete={() => onRequestDeleteAgent(session, project.path)}
              />
            ))}
          </React.Fragment>
        )
```

with:

```tsx
        const hasAgents = projectSessions.length > 0
        const groupClass = `sidebar-project-group${hasAgents ? ' sidebar-project-group--has-agents' : ' sidebar-project-group--empty'}`

        return (
          <div key={project.id} className={groupClass}>
            <ProjectItem
              project={project}
              isActive={isActive}
              onSelect={handleProjectClick}
              onRemove={onRemove}
              onUpdateProject={onUpdateProject}
              isFetching={fetchingProjectId === project.id}
              fetchResult={lastFetchedProjectId === project.id ? fetchResult : null}
              fetchError={lastFetchedProjectId === project.id ? fetchError : null}
              onFetch={() => onFetchProject(project.id)}
            />
            {projectSessions.map((session) => (
              <AgentItem
                key={session.id}
                session={session}
                projectPath={project.path}
                isActive={session.id === activeSessionId}
                onSelect={(sessionId) => onSelectSession(sessionId, project.id)}
                onDelete={() => onRequestDeleteAgent(session, project.path)}
              />
            ))}
          </div>
        )
```

- [ ] **Step 5: Run tests to verify no regressions**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: All 19 tests pass. The tests query by text content and class names, not by specific DOM nesting, so the wrapper div should be transparent.

- [ ] **Step 6: Run full test suite**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/styles/theme.css src/renderer/components/sidebar/ProjectSidebar.tsx
git commit -m "feat: sidebar project grouping with elevated cards"
```

---

### Task 6: Active Selection Refinement + Agent Card Treatment

Replace the harsh `box-shadow: inset 0 0 0 1px` active state with a subtle left accent bar. Give agent items a card-like background with a status-colored left border.

**Files:**
- Modify: `src/renderer/styles/theme.css:447-451` (active selection), add agent card rules
- Modify: `src/renderer/components/sidebar/AgentItem.tsx:78` (add status-border class)

- [ ] **Step 1: Run existing tests to establish baseline**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: All tests pass.

- [ ] **Step 2: Replace active selection style in theme.css**

In `src/renderer/styles/theme.css`, replace:

```css
.sidebar-item-row--active {
  background: var(--sidebar-active-bg);
  box-shadow: inset 0 0 0 1px var(--sidebar-active-border);
  color: var(--sidebar-active-text);
}
```

with:

```css
.sidebar-item-row--active {
  background: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
}

.sidebar-project-row.sidebar-item-row--active {
  border-left: 2px solid var(--accent);
  padding-left: 9px;
}
```

The `padding-left: 9px` compensates for the 2px border so content doesn't shift (original padding-left was 11px).

- [ ] **Step 3: Replace agent row styling with card treatment in theme.css**

In `src/renderer/styles/theme.css`, find the existing `.sidebar-agent-row` rule and replace it. Find:
```css
.sidebar-agent-row {
  flex-direction: column;
  align-items: flex-start;
  min-height: auto;
  padding: 2px 12px 2px 28px;
  gap: 0;
}
```

Replace with:
```css
.sidebar-agent-row {
  flex-direction: column;
  align-items: flex-start;
  min-height: auto;
  padding: 4px 12px 4px 28px;
  gap: 0;
  margin-top: 1px;
  margin-bottom: 1px;
  background: var(--bg-input);
  border-left: 2px solid transparent;
}

.sidebar-agent-row:hover {
  transform: translateY(-0.5px);
  box-shadow: var(--shadow-subtle);
}

.sidebar-agent-row--running {
  border-left-color: var(--status-running);
}

.sidebar-agent-row--waiting {
  border-left-color: var(--status-waiting);
}

.sidebar-agent-row--done {
  border-left-color: var(--status-done);
}

.sidebar-agent-row--error {
  border-left-color: var(--status-error);
}
```

- [ ] **Step 4: Add active agent selection style**

In `src/renderer/styles/theme.css`, after the agent status border rules, add:

```css
.sidebar-agent-row.sidebar-item-row--active {
  border-left-width: 2px;
  background: var(--sidebar-active-bg);
}
```

- [ ] **Step 5: Add status class to AgentItem component**

In `src/renderer/components/sidebar/AgentItem.tsx`, update the className on the outer div (line 78). Replace:

```tsx
      className={`sidebar-item-row sidebar-agent-row${isActive ? ' sidebar-item-row--active' : ''}`}
```

with:

```tsx
      className={`sidebar-item-row sidebar-agent-row sidebar-agent-row--${session.status}${isActive ? ' sidebar-item-row--active' : ''}`}
```

- [ ] **Step 6: Run tests to verify no regressions**

Run: `npx vitest run src/renderer/components/sidebar/ProjectSidebar.test.tsx`
Expected: All 19 tests pass. The test at line 153 checks for `sidebar-item-row--active` class which is still present.

- [ ] **Step 7: Run full test suite**

Run: `npm run typecheck && npm test`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/styles/theme.css src/renderer/components/sidebar/AgentItem.tsx
git commit -m "feat: accent-bar active selection and status-bordered agent cards"
```

---

### Task 7: Final Verification

Run full typecheck and test suite to confirm everything works together.

**Files:**
- None (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors.

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev`
Verify:
- Gradient buttons visible on "+ New Agent", Save in settings, git panel buttons
- Focus rings show soft glow when Tab-navigating
- Scrollbars are thinner (6px)
- Settings modal has frosted glass backdrop
- Sidebar shows project groups with elevated cards for repos with agents
- Empty repos appear dimmed with no card background
- Agent items have status-colored left borders (blue=running, yellow=waiting, green=done, red=error)
- Active project shows accent left bar
- Hover on agent cards shows subtle lift
- All transitions are smooth (150-200ms)
