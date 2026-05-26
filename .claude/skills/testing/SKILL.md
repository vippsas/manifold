---
name: testing
description: Use whenever running tests in this project — verifying a fix, validating a PR, running the suite after changes, or checking a single file. Covers which command to use, how the `better-sqlite3` ABI rebuild fits in, and how to target individual files.
---

# Running tests

Always run tests via `npm test`. Don't invoke `vitest` directly with `npx vitest run` — that skips the `pretest` hook and the `src/main/memory/memory-store-*` tests will fail with a `NODE_MODULE_VERSION` mismatch when the native `better-sqlite3` binary was last rebuilt for Electron.

## Commands

| Goal | Command |
|------|---------|
| Run the whole suite | `npm test` |
| Watch mode | `npm run test:watch` |
| One file | `npm test -- path/to/file.test.ts` |
| Pattern in test name | `npm test -- -t "pattern"` |

`npm test --` forwards args to vitest. `npm test -- path/to/file.test.ts` works because the `pretest` hook still fires.

## Why `npm test` and not `npx vitest run`

`package.json` wires up:

```json
"pretest": "npm run rebuild:node",
"test": "vitest run",
"rebuild:node": "node scripts/rebuild-better-sqlite3-node.mjs"
```

`better-sqlite3` is a native module. The app rebuilds it for Electron's Node ABI via `npm run rebuild:electron` (run before `dev`, `start`, `dist`). Tests run under the system Node, which has a different ABI, so the `pretest` hook rebuilds it for the test environment first. Skipping `pretest` leaves the binary in whichever state was last set up — often Electron's — and any test that touches `src/main/memory/memory-store.ts:31` (`new Database(...)`) blows up before its first assertion.

CI (`.github/workflows/release-dmg.yml`) uses `npm test` for the same reason.

## When tests fail with `NODE_MODULE_VERSION`

You ran `npx vitest` instead of `npm test`. Run `npm test` and the `pretest` hook fixes it. No need to manually `npm rebuild better-sqlite3` — the script does the right thing.

## Before claiming a change is done

1. `npm test` — full suite passes
2. `npm run typecheck` — no TypeScript errors
3. For UI changes, exercise the change in the running app — tests verify code correctness, not feature correctness
