---
name: refactor
description: Use when refactoring code, improving code quality, cleaning up patterns, or applying best practices in this Electron + React + TypeScript project. Triggers on refactoring requests, code cleanup, "make this better", extracting hooks/components, restructuring modules, or any work that changes code structure without changing behavior. Also use when writing new code that should follow established project conventions.
---

# Refactoring & Best Practices

This skill encodes the conventions and patterns established in this Electron desktop application. The goal is to make every refactoring move consistent with the existing codebase — not to impose external opinions, but to amplify patterns that already work here.

## Before Touching Anything

1. **Read the code you're changing.** Understand the current shape before proposing a new one.
2. **Run existing tests** to establish a green baseline: `npx vitest run`
3. **Identify the layer** — main process (Node/Electron), renderer (React), preload (IPC bridge), or shared types. Each has different rules.

## Architecture Layers

The app follows strict Electron process separation:

| Layer | Location | Runtime | Pattern |
|-------|----------|---------|---------|
| Main | `src/main/` | Node.js | Class-based services with dependency injection |
| Preload | `src/preload/` | Isolated | Channel-allowlist IPC bridge |
| Renderer | `src/renderer/` | Browser | React hooks + functional components |
| Shared | `src/shared/` | Both | Pure type definitions only |

Never break these boundaries. The renderer has zero Node.js access — everything goes through IPC.

## Main Process Conventions

### Class-based services

Every main-process module is a class with private state and public methods. Services like `SessionManager`, `PtyPool`, `WorktreeManager`, and `FileWatcher` all follow this shape:

- Private `Map<string, T>` for in-memory registries
- Public methods that operate on the registry
- A `setMainWindow(win)` method when the service pushes events to the renderer
- A private `sendToRenderer(channel, ...args)` guard that checks `!mainWindow.isDestroyed()`

When refactoring main-process code:
- Keep services focused on a single domain (sessions, files, git, settings)
- Inject dependencies through constructor parameters or a typed `deps` object — no global singletons
- Use `throw new Error(...)` for required preconditions, `try/catch` with intentional swallowing for best-effort cleanup
- Persist state to `~/.manifold/` using sync `fs` APIs (this is deliberate, not a mistake)

### IPC handler registration

All `ipcMain.handle` calls live in `src/main/ipc-handlers.ts`, organized into private `register*Handlers()` functions by domain. Dependencies arrive through a single `IpcDependencies` interface.

When adding or modifying IPC:
- Add the channel string to the `ALLOWED_INVOKE_CHANNELS` or `ALLOWED_LISTEN_CHANNELS` const tuple in `src/preload/index.ts`
- Follow the `namespace:action` kebab-case naming: `agent:spawn`, `files:read`, `settings:update`
- Guard path-based handlers against traversal (resolved path must `startsWith` the allowed root)

## Renderer Conventions

### Hooks-heavy architecture

Business logic lives in hooks, not components. `App.tsx` is purely compositional — it instantiates hooks and passes state down as props.

Each feature domain has its own hook file in `src/renderer/hooks/`:
- `useProjects`, `useAgentSession`, `useFileWatcher`, `useDiff`, `useSettings`, `useCodeView`, `usePaneResize`, `useTerminal`
- All hooks return a typed result interface (e.g., `UseProjectsResult`)
- `useIpcInvoke<T>` and `useIpcListener<T>` are the foundational IPC primitives — use them instead of calling `window.electronAPI` directly in new hooks

When refactoring hooks:
- If a hook grows beyond ~100 lines of logic, decompose it into private sub-hooks defined as module-level functions (see `useAgentSession.ts` for this pattern: `useFetchSessionsOnProjectChange(...)`, `useStatusListener(...)`, etc.)
- Wrap every returned callback in `useCallback` with explicit, complete dependency arrays
- Use the `handlerRef` pattern (ref that always points to the latest callback) to avoid re-registering IPC listeners on every render — `useIpcListener` already does this
- Suppress floating promise warnings with `void` prefix: `void fetchProjects()`
- Model error state as `string | null`, extracted via `err instanceof Error ? err.message : String(err)`

### Component decomposition

Large components are split into smaller named sub-components **in the same file**, not in separate files:

```
ProjectSidebar.tsx → SidebarHeader, ProjectList, ProjectItem, SidebarActions, CloneForm
CodeViewer.tsx     → TabBar, EditorContent
FileTree.tsx       → TreeNode, NodeRow
SettingsModal.tsx  → ModalHeader, SettingsBody, ModalFooter
```

When a component file grows unwieldy:
- Extract sub-components within the same file first
- Only move to separate files if the sub-component is reused across multiple parents
- Every component's return type is explicitly annotated: `React.JSX.Element` or `React.JSX.Element | null`

### Styling

The project uses **CSS custom properties** for theming and **inline style objects** for component-specific layout. No CSS modules, no styled-components, no Tailwind.

- **Theme tokens** are in `src/renderer/styles/theme.css` as CSS variables under `.theme-dark` / `.theme-light`
- **Layout classes** (`.layout-root`, `.layout-sidebar`, `.layout-panes`) and **utility classes** (`.mono`, `.truncate`, `.flex-center`) are in the same file
- **Component styles** are defined as `const *Styles: Record<string, React.CSSProperties>` objects, co-located in the `.tsx` file or in an adjacent `.styles.ts` when large
- Dynamic styles spread a base object and override specific properties inline

When refactoring styles:
- Add new design tokens to `theme.css` if the value appears in more than one component
- Use the spacing scale (`--space-xs` through `--space-xl`) and radius scale (`--radius-sm/md/lg`) instead of magic numbers
- Keep the naming pattern: `sidebarStyles`, `tabStyles`, `viewerStyles`

## TypeScript Conventions

- **Strict mode is on.** Don't weaken it with `any`, `@ts-ignore`, or non-null assertions unless truly unavoidable — and if you must, add a comment explaining why.
- **`interface`** for object shapes (props, return types, service contracts): `AgentRuntime`, `AgentSession`, `IpcDependencies`
- **`type`** for unions and primitive aliases: `AgentStatus = 'running' | 'waiting' | 'done' | 'error'`, `CodeViewMode`
- **No `I` prefix** on interfaces — `AgentSession` not `IAgentSession`
- **Constants** use `UPPER_SNAKE_CASE`: `BUILT_IN_RUNTIMES`, `WORKTREE_DIR`
- All shared types live in `src/shared/types.ts` — this file is importable by both main and renderer

## Testing Conventions

Tests are **co-located** next to source files: `session-manager.test.ts` beside `session-manager.ts`.

### Main process tests
- Pure unit tests with `vi.mock()` for all external deps (node-pty, simple-git, uuid, fs)
- Mock factories as named functions: `createMockWorktreeManager()`, `createMockPtyPool()` — returning `vi.fn()`-stubbed objects cast via `as unknown as Type`
- `beforeEach` calls `vi.clearAllMocks()`
- `describe`/`it` grouping by class method or behavior

### Renderer tests
- Hooks: `renderHook` + `waitFor` from `@testing-library/react`, inject `window.electronAPI` in `beforeEach`
- Components: `render` + `screen` + `fireEvent`, with helper `render*` factory functions accepting prop overrides
- Wrap state-modifying calls in `act()`

### What to test when refactoring
- If you change a public API or add a code path, add or update a test
- If you extract a function, the existing tests should still pass — if they don't, the extraction changed behavior
- Run `npx vitest run` after every refactoring step, not just at the end

## Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Files | `kebab-case.ts` / `PascalCase.tsx` | `session-manager.ts`, `FileTree.tsx` |
| Hooks | `use` + PascalCase | `useAgentSession` |
| Style objects | camelCase + `Styles` | `sidebarStyles` |
| CSS classes | kebab-case, BEM-like modifiers | `.status-dot--running` |
| IPC channels | `namespace:action` | `agent:spawn` |
| Interfaces | PascalCase, no `I` prefix | `AgentSession` |
| Type aliases | PascalCase | `AgentStatus` |

## Refactoring Checklist

Before calling any refactoring complete:

1. Tests pass: `npx vitest run`
2. TypeScript compiles: `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
3. No new `any` types introduced
4. No boundary violations (renderer importing from main, main importing from renderer)
5. Naming follows existing conventions
6. No dead code left behind — if something is unused after refactoring, delete it
7. If you changed a hook's return type, check every consumer
8. If you changed an IPC channel, update the preload allowlist

## Common Refactoring Moves

### Extract a hook
When component logic grows, pull it into a `use*` hook in `src/renderer/hooks/`:
1. Create the hook file following the naming convention
2. Define a result interface: `interface Use*Result { ... }`
3. Move state + effects + callbacks into the hook
4. Return the typed result object
5. Import and call from the component
6. The component should now be purely presentational

### Extract a sub-hook
When a hook grows beyond ~100 lines, decompose into module-level functions:
```ts
function useStatusListener(setSessions: React.Dispatch<...>) { ... }
function useExitListener(setSessions: React.Dispatch<...>) { ... }
```
Call them from the main hook. They're private to the module — not exported.

### Extract a main-process service
When a class takes on too many responsibilities:
1. Create a new class in `src/main/` with its own test file
2. Define its interface in `src/shared/types.ts` if needed
3. Inject it as a dependency where it's used
4. Add it to `IpcDependencies` if it needs IPC handlers
5. Wire it up in `src/main/index.ts`

### Consolidate inline styles
When the same style values appear across multiple components:
1. Add a CSS variable to `theme.css`
2. Replace inline values with `var(--your-token)`
3. Update style objects to reference the variable

### Simplify conditional rendering
Prefer early returns and guard clauses over deeply nested ternaries. A component returning `null` early is clearer than `condition ? <BigTree /> : null` at the end.
