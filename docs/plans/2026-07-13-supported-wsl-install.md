# Supported WSL Install Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Manifold's x64 WSL2 source-build and local-install path reliable, tested, and accurately documented without publishing Linux releases.

**Architecture:** Keep electron-builder's Linux `dir` target and harden the existing WSLg launcher. Isolate platform-specific terminal launching, disable unsupported Linux auto-updates, verify packaged native modules, and continuously exercise the Linux build in non-publishing CI.

**Tech Stack:** Electron, TypeScript, Vitest, electron-builder, Bash, GitHub Actions.

---

### Task 1: Platform Terminal Launcher

**Files:**
- Create: `src/main/ipc/open-terminal.ts`
- Create: `src/main/ipc/open-terminal.test.ts`
- Modify: `src/main/ipc/file-handlers.ts:1-10,206-214`

**Step 1: Write failing tests**

Test that `openTerminal(directory, platform, spawnImpl)` uses `open -a Terminal <directory>` on Darwin, uses `x-terminal-emulator --working-directory <directory>` on Linux, rejects unsupported platforms, and rejects spawn `error` events with a controlled message.

**Step 2: Verify red**

Run: `npm test -- src/main/ipc/open-terminal.test.ts`
Expected: FAIL because `open-terminal.ts` does not exist.

**Step 3: Implement the minimum helper**

Use argument arrays only; do not invoke a shell. Resolve after the child emits `spawn`, reject on `error`, and call the helper from the existing IPC handler after its path-allowlist check.

**Step 4: Verify green**

Run: `npm test -- src/main/ipc/open-terminal.test.ts src/main/ipc/file-handlers.test.ts`
Expected: PASS.

### Task 2: Linux Updater Policy

**Files:**
- Modify: `src/main/app/auto-updater.ts:23-25,231-242`
- Modify: `src/main/app/auto-updater.test.ts`
- Modify: `docs/architecture/app.md`

**Step 1: Write a failing test**

Mock `process.platform` as Linux with `app.isPackaged = true`, invoke `setupAutoUpdater()`, and assert no updater listeners or update check are registered.

**Step 2: Verify red**

Run: `npm test -- src/main/app/auto-updater.test.ts`
Expected: FAIL because packaged Linux currently initializes electron-updater.

**Step 3: Implement the minimum policy**

Make `shouldRunAutoUpdater()` return false on Linux and record a debug message that directory-based Linux installs update by rebuilding/reinstalling. Preserve macOS behavior.

**Step 4: Verify green and update covering docs**

Run: `npm test -- src/main/app/auto-updater.test.ts`
Expected: PASS.

Update `docs/architecture/app.md`, including its `updated:` date and current file-line citations.

### Task 3: Installer And Package Verification

**Files:**
- Modify: `install-linux.sh`
- Create: `scripts/verify-linux-package.mjs`
- Create: `scripts/verify-linux-package.test.ts`
- Modify: `package.json:6-29`

**Step 1: Write failing verifier tests**

Create temporary package trees and test that verification rejects a missing executable or any missing required native module, and accepts a complete tree containing:

- `resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node`
- `resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
- one `resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-*/skia.*.node`

**Step 2: Verify red**

Run: `npm test -- scripts/verify-linux-package.test.ts`
Expected: FAIL because the verifier does not exist.

**Step 3: Implement verifier and script wiring**

Export a pure `verifyLinuxPackage(root)` function, provide a CLI entry point, and add `verify:linux-package` to `package.json`. Do not add dependencies.

**Step 4: Harden installation**

After `dist:linux`, run package verification. Copy `linux-unpacked/.` to a staging directory, verify the staged executable, then replace the current application directory. Preserve the WSL launcher flags and fail before replacement when validation fails.

**Step 5: Verify green**

Run: `npm test -- scripts/verify-linux-package.test.ts`
Expected: PASS.

Run after packaging: `npm run verify:linux-package`
Expected: prints a concise success message and exits 0.

### Task 4: Non-Publishing Linux CI

**Files:**
- Create: `.github/workflows/ci-linux.yml`

**Step 1: Add the workflow**

Trigger on pull requests and pushes to `main`. Use `ubuntu-latest`, `actions/checkout@v6`, `actions/setup-node@v6` with Node 24 and npm cache, then run:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run dist:linux`
5. `npm run verify:linux-package`

Do not add release permissions, secrets, artifact publication, or `--publish always`.

**Step 2: Validate syntax and policy**

Inspect the workflow and confirm only the existing `dist:linux` command is used for packaging and that it retains `--publish never`.

### Task 5: User And Build Documentation

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/architecture/build.md`

**Step 1: Reconcile support statements**

State that macOS has downloadable releases while x64 WSL2 with WSLg supports source builds and local directory installation. State that Windows-native and Linux auto-update are unsupported.

**Step 2: Correct installation details**

Use the canonical `vippsas/manifold` clone URL. Document Node 20+, Git, ripgrep, Python 3, make, and a C/C++ compiler. Describe `install-linux.sh` as installing `linux-unpacked`, not AppImage.

**Step 3: Update architecture docs**

Update `docs/architecture/build.md` for `dist:linux`, native dependencies, package verification, Linux CI, and `install-linux.sh`. Bump `updated:` and verify every current-code claim with file-line citations.

### Task 6: Integrated Verification

**Files:** none unless a verification failure exposes a scoped bug.

**Step 1: Run full checks**

Run:

- `npm test`
- `npm run typecheck`
- `npm run dist:linux`
- `npm run verify:linux-package`
- `bash scripts/wiki-lint.sh`

Expected: all exit 0.

**Step 2: WSLg smoke test**

Launch `dist/linux-unpacked/manifold --ozone-platform=x11 --disable-dev-shm-usage` with a bounded timeout. Confirm it remains running without immediate native-module or shared-library errors.

**Step 3: Review**

Review the integrated diff for accidental dependency changes, publishing behavior, unrelated refactors, and documentation drift. Confirm the original workspace's modified `package-lock.json` and untracked plan remain untouched.
