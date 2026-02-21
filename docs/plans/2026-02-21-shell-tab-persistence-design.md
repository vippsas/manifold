# Shell Tab Persistence Design

## Goal

Restore extra shell tabs (created via the "+" button) when the app restarts. Tabs open as fresh shells in the same working directories with the same labels.

## What Gets Persisted

Per agent (keyed by worktree path):
- Array of tab labels and cwds
- Counter for next tab label number

The built-in Worktree and Project tabs are always recreated automatically — only extra tabs need persistence.

## Storage

File: `~/.manifold/shell-tabs.json`

```json
{
  "/Users/me/.manifold/worktrees/myproject/oslo": {
    "tabs": [
      { "label": "Shell 3", "cwd": "/Users/me/.manifold/worktrees/myproject/oslo" },
      { "label": "Shell 4", "cwd": "/Users/me/.manifold/worktrees/myproject/oslo" }
    ],
    "counter": 5
  }
}
```

## Components

### ShellTabStore (main process)

New class following the `ViewStateStore` pattern:
- `get(agentKey: string)` — returns saved tabs for an agent
- `set(agentKey: string, state)` — saves tabs for an agent
- `delete(agentKey: string)` — removes saved state

### IPC Channels

- `shell-tabs:get` — renderer requests saved tabs for an agent key
- `shell-tabs:set` — renderer saves current tab state for an agent key

### ShellTabs Component Changes

- On mount / agent switch: call `shell-tabs:get` to check for saved tabs, create fresh shells for each via `shell:create`, populate `extraShells` state
- On tab add/remove: call `shell-tabs:set` to persist current tab state

## Data Flow

### Save (on every tab add/remove)
1. ShellTabs computes current tab metadata (labels, cwds, counter)
2. Calls `shell-tabs:set` with agent key and metadata
3. ShellTabStore writes to disk

### Restore (on mount / agent switch)
1. ShellTabs calls `shell-tabs:get` for the current agent key
2. If saved state exists, creates a shell per saved tab via `shell:create`
3. Populates `extraShells` state with new session IDs + saved labels
4. Counter restored from saved state

## No History

Shell sessions start fresh. No output buffer preservation.
