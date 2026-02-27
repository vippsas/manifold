# Contributing to Manifold

Thanks for your interest in contributing to Manifold! This guide will help you get started.

## Prerequisites

- **Node.js** (v18+)
- **npm**
- **macOS** (Manifold currently targets macOS only)
- **Git**
- At least one supported CLI agent installed (Claude Code, Codex, or Gemini CLI)

## Getting Started

```bash
git clone https://github.com/svenmalvik/manifold.git
cd manifold
npm install
npm run dev
```

## Development Commands

```bash
npm run dev          # Start Electron in dev mode (hot reload)
npm run build        # Production build
npm run typecheck    # Full typecheck (main + renderer)
npm test             # Run all tests
npm run test:watch   # Watch mode
```

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
