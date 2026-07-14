# Contributing to Manifold

Thanks for your interest in contributing to Manifold! This guide will help you get started.

## Prerequisites

- **Node.js** (v20+)
- **npm**
- **Platform** — macOS, or x64 WSL2 with WSLg and native build tools (`build-essential`, Python 3)
- **Git**
- At least one supported CLI agent installed (Claude Code, Codex, or Gemini CLI)

## Getting Started

```bash
git clone https://github.com/vippsas/manifold.git
cd manifold
npm run bootstrap   # install deps, verify Electron, rebuild better-sqlite3 for Electron
npm run dev
```

`npm run bootstrap` is also the one-step setup for a fresh **git worktree**, where a bare
`npm install` (or a symlinked `node_modules`) can leave Electron half-installed. Run
`npm run doctor` any time to check the environment's health (deps, Electron binary,
`better-sqlite3` ABI, and whether `out/` is stale).

## Development Commands

```bash
npm run bootstrap    # One-step worktree setup (install + verify Electron + rebuild)
npm run doctor       # Report environment health (deps, Electron, ABI, out/ staleness)
npm run dev          # Start Electron in dev mode (hot reload)
npm run build        # Production build
npm run typecheck    # Full typecheck (main + renderer)
npm test             # Run all tests
npm run test:watch   # Watch mode
```

### The `better-sqlite3` Node ↔ Electron ABI flip

`better-sqlite3` is a native module, and its compiled binary is valid for exactly one
runtime's ABI at a time. Tests run under system **Node**; the app runs under **Electron**,
which has a different ABI. The two entry points therefore rebuild it for opposite runtimes:

- `npm test` → `pretest` rebuilds for **Node** (`npm run rebuild:node`).
- `npm run dev` / `start` / `dist` → their `pre*` hooks rebuild for **Electron** (`npm run rebuild:electron`).

Running the tests leaves the binary built for Node, so the dev app won't load it until it's
rebuilt for Electron — and vice-versa. This is expected: the `pre*` hooks flip the ABI back
automatically, so **just run the command you want** (`npm run dev` after `npm test` rebuilds
for Electron on its own). If the app is already running when you run tests, or you hit a
`NODE_MODULE_VERSION` load error, the manual fix is **`npm run rebuild:electron`**.
`npm run doctor` reports which ABI the binary is currently built for.

## Project Structure

Manifold follows the standard Electron three-process model:

- **`src/main/`** — Main process (Node.js). Business logic, PTY management, git worktrees, file system.
- **`src/preload/`** — Bridge layer. Whitelisted IPC channels via `contextBridge`.
- **`src/renderer/`** — React UI. No direct Node.js access.
- **`src/shared/`** — Types and defaults shared between main and renderer. Must stay free of Node.js-specific imports.

## Code Conventions

- **TypeScript strict mode** everywhere.
- **Tests** are co-located with source files (`*.test.ts` / `*.test.tsx`).
- **Component styles** are co-located in `*.styles.ts` files exporting plain objects.
- **IPC channels** follow `domain:action` naming (e.g., `agent:spawn`, `files:read`).
- **Worktree branches** are prefixed with `manifold/` (e.g., `manifold/oslo`).
- Use **relative imports** in production code (path aliases like `@shared` are vitest-only).

## Adding a New IPC Channel

Update three files:

1. `src/main/ipc-handlers.ts` — add the handler
2. `src/preload/index.ts` — whitelist the channel
3. The renderer hook that calls it

## Submitting Changes

1. Fork the repository and create a feature branch.
2. Make your changes.
3. Run `npm run typecheck` and `npm test` to verify everything passes.
4. Submit a pull request with a clear description of the change.

## Reporting Issues

Use [GitHub Issues](https://github.com/svenmalvik/manifold/issues) to report bugs or request features. Include steps to reproduce, expected behavior, and your environment details.
