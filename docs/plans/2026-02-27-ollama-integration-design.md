# Ollama Integration Design

## Goal

Add Ollama support to Manifold so users can run Claude Code and Codex backed by local Ollama-served models. Ollama wraps these agent CLIs via `ollama launch <agent> --model <model>`.

## Approach

Ollama variants are added as new built-in runtimes ("Claude Code (Ollama)", "Codex (Ollama)"). Each uses `binary: 'ollama'` with `args: ['launch', '<agent>']`. The user picks an Ollama model per session, discovered via `ollama list`.

Gemini CLI is not supported by Ollama and is excluded.

## Changes

### Types (`src/shared/types.ts`)

- `AgentRuntime`: add `needsModel?: boolean` to flag runtimes requiring a model picker.
- `SpawnAgentOptions`: add `ollamaModel?: string` for the selected model name.

### Runtimes (`src/main/runtimes.ts`)

Two new entries in `BUILT_IN_RUNTIMES`:

```typescript
{
  id: 'ollama-claude',
  name: 'Claude Code (Ollama)',
  binary: 'ollama',
  args: ['launch', 'claude'],
  needsModel: true,
  waitingPattern: '❯|waiting for input|Interrupt to stop'
}
{
  id: 'ollama-codex',
  name: 'Codex (Ollama)',
  binary: 'ollama',
  args: ['launch', 'codex'],
  needsModel: true,
  waitingPattern: '> |codex>'
}
```

No `aiModelArgs` — AI-assisted commit messages are not available for Ollama runtimes.

### Model Discovery (`src/main/ollama-models.ts`)

New module:
- `listOllamaModels()`: executes `ollama list`, parses output, returns `string[]` of model names.
- Handles Ollama not installed/not running gracefully (returns empty array).

### IPC

- New handler: `ollama:list-models` in settings-handlers.
- Preload whitelist: add `ollama:list-models` to invoke channels.

### Session Spawn (`src/main/session-manager.ts`)

When `ollamaModel` is provided in spawn options, append `['--model', ollamaModel]` to the runtime's args array before passing to `ptyPool.spawn()`.

Persist selected model in worktree metadata (`metadata.json`) so session resume can restore it.

### Session Resume (`src/main/session-manager.ts`)

Read `ollamaModel` from worktree metadata and re-append `--model` args on resume.

### UI (`src/renderer/components/NewAgentPopover.tsx`)

When the selected runtime has `needsModel: true`:
- Fetch models via `ollama:list-models` IPC.
- Show a model dropdown below the runtime selector.
- Pass selected model as `ollamaModel` in `SpawnAgentOptions`.
- Disable Launch if no model selected.

### AI Operations (`src/main/ipc/git-handlers.ts`)

For Ollama runtimes (no `aiModelArgs`), skip AI commit message generation gracefully. The `aiGenerate` function already handles missing args — just ensure no crash when `aiModelArgs` is undefined.

## Out of Scope

- Custom/user-defined runtimes (future work).
- Gemini CLI via Ollama (not supported by Ollama).
- Model download/pull from within Manifold.
