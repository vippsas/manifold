# Delete Agent/Worktree

## Problem
Agents in the sidebar have no way to be removed. Users cannot clean up finished or unwanted agent sessions.

## Design

### UI
- Add `×` button to `AgentItem` component, matching existing `ProjectItem` remove button pattern
- Button visible on hover for all agent states (running, waiting, done, error)

### Callback Flow
```
AgentItem (onClick ×) → ProjectSidebar (onDeleteAgent) → App → useAgentSession.deleteAgent(sessionId)
```

### Hook Logic (`deleteAgent`)
1. Call `agent:kill` IPC (triggers SessionManager.killSession)
2. Remove session from local `sessions` state
3. If deleted session was `activeSessionId`, clear it

### Backend (already implemented)
- `agent:kill` IPC handler: unwatches file changes, calls `killSession`
- `SessionManager.killSession`: kills PTY, removes worktree + branch, removes from Map
- Works for all states — dead PTYs are safely skipped

### Styles
- Reuse `removeButton` pattern from `ProjectItem` in `ProjectSidebar.styles.ts`

### No confirmation dialog
Matches existing project remove UX. Agents are cheap to recreate.

## Files to Change
1. `src/renderer/components/ProjectSidebar.styles.ts` — agent delete button style (or reuse existing)
2. `src/renderer/components/ProjectSidebar.tsx` — add delete button to AgentItem, wire callback
3. `src/renderer/hooks/useAgentSession.ts` — add `deleteAgent` function
4. `src/renderer/App.tsx` — pass `deleteAgent` through to ProjectSidebar
5. `src/renderer/components/ProjectSidebar.test.tsx` — test delete behavior
