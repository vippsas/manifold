# Per-Repository Shell History

## Problem

Manifold's shell terminals have no working command history. When a user presses arrow-up, nothing appears -- even though `~/.zsh_history` has entries.

**Root cause:** `createManifoldZdotdir()` sets `ZDOTDIR` to a temporary directory. Zsh looks for its history file at `$ZDOTDIR/.zsh_history`, which is empty. The user's `~/.zsh_history` is never loaded.

## Solution

Configure `HISTFILE` explicitly in the generated `.zshrc` to point to a per-repository (or global) path under `~/.manifold/history/`. Zsh handles the rest natively -- arrow-up/down, Ctrl+R search, dedup, persistence.

## Setting

New field in `ManifoldSettings`:

```typescript
shellHistoryScope: 'project' | 'global'
```

- **`'project'` (default):** Each repository gets its own history file at `~/.manifold/history/<projectName>/.zsh_history`. Commands typed in one agent are visible via arrow-up in any other agent for the same project.
- **`'global'`:** All repositories share a single history file at `~/.manifold/history/.zsh_history`. Arrow-up shows commands from all projects.

## History Configuration

The generated `.zshrc` will include:

```zsh
HISTFILE="<resolved path>"
HISTSIZE=10000
SAVEHIST=10000
setopt INC_APPEND_HISTORY
setopt HIST_IGNORE_DUPS
```

- `INC_APPEND_HISTORY` writes commands immediately (not at shell exit), so they're visible across concurrent shells.
- `HIST_IGNORE_DUPS` prevents consecutive duplicate entries.
- The history directory is created on demand (`mkdirSync` with `{ recursive: true }`).

## Project Name Resolution

The `cwd` passed to `shell:create` follows the pattern `~/.manifold/worktrees/<projectName>/manifold-<agentName>`. The project name is extracted from this path structure. For project-root shells (where cwd is the original repo path, not a worktree), the project name is derived from `ProjectRegistry` lookup or falls back to the directory basename.

## Data Flow

1. Renderer calls `shell:create` with `cwd`
2. IPC handler reads `shellHistoryScope` from `SettingsStore`
3. `SessionManager.createShellSession()` resolves the `HISTFILE` path:
   - `'project'` mode: `~/.manifold/history/<projectName>/.zsh_history`
   - `'global'` mode: `~/.manifold/history/.zsh_history`
4. Path passed to `createShellPtySession()` -> `createManifoldZdotdir()`
5. `.zshrc` written with `HISTFILE` and history options
6. Zsh loads history from the file on startup, saves on each command

## Files Changed

| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `shellHistoryScope: 'project' \| 'global'` to `ManifoldSettings` |
| `src/shared/defaults.ts` | Default `shellHistoryScope` to `'project'` |
| `src/main/session/shell-prompt.ts` | Accept `historyPath` param, add history config to generated `.zshrc`, mkdir history dir |
| `src/main/session/session-resume.ts` | Accept and pass through `historyPath` to `createManifoldZdotdir()` |
| `src/main/session/session-manager.ts` | Resolve history path from settings + cwd, pass to `createShellPtySession()` |
| `src/main/ipc/agent-handlers.ts` | Pass `shellHistoryScope` into session manager call |
| `src/main/session/shell-prompt.test.ts` | Test history config in generated `.zshrc` |
| `src/main/session/session-manager.test.ts` | Test history path resolution |

## Behavior Examples

- Agent "oslo" on project "manifold", scope `'project'`:
  - HISTFILE = `~/.manifold/history/manifold/.zsh_history`
- Agent "bergen" on same project:
  - Same HISTFILE -- arrow-up shows oslo's commands
- Agent on project "other-app", scope `'project'`:
  - HISTFILE = `~/.manifold/history/other-app/.zsh_history` -- separate history
- Any agent, scope `'global'`:
  - HISTFILE = `~/.manifold/history/.zsh_history` -- shared across all projects

## Scope

- Only zsh is supported (the existing `createManifoldZdotdir` is zsh-specific)
- No renderer/preload/IPC channel changes needed (the setting is read server-side)
- No xterm.js changes
- ShellTabStore untouched
