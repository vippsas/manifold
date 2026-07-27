---
description: How Manifold is built, type-checked, tested, packaged for macOS and x64 WSL2/Linux, and released.
covers: [package.json]
updated: 2026-07-27
owner: see .github/CODEOWNERS
---

# Build & release — npm scripts, electron-vite, native rebuilds, and the .dmg pipeline

Manifold is an Electron app bundled with **electron-vite** (three independent builds:
main, preload, renderer) plus a separate **esbuild** pass that compiles the built-in
plugins under `resources/plugins/`. Native dependencies including `better-sqlite3` and
`node-pty` must be
rebuilt against whichever runtime will load it (Node for tests, Electron for the app), so
nearly every entry-point script is fronted by a `pre*` rebuild hook. Packaging is
electron-builder producing signed/notarized macOS `.dmg` + `.zip`, and a release is a
two-step `release.sh` dance: prepare a version-bump PR, then (after merge) push a `v*` tag
that the GitHub Actions workflow turns into the actual build.

## Covered code

- `package.json` — the `scripts` block (lines 6–35) and the `build` block (electron-builder config, lines 60–118). The primary owner of this page.
- `electron.vite.config.ts` — the three-target electron-vite config (main / preload / renderer).
- `scripts/build-plugins.mjs` — `buildPlugins()`, the esbuild compiler for built-in plugins.
- `scripts/setup-worktree.sh` — `npm run bootstrap`, the one-step worktree setup (install → assert Electron → `rebuild:electron`).
- `scripts/doctor.mjs` — `npm run doctor`, the environment health report (deps / Electron / `better-sqlite3` ABI / `out/` staleness).
- `scripts/rebuild-better-sqlite3-node.mjs` — conditional rebuild of `better-sqlite3` for the **Node** runtime (tests).
- `scripts/sync-codex-skills.mjs` — `npm run sync:codex-skills`, which refreshes Codex installs of checked-in repo skills.
- `scripts/new-plugin.mjs` — `npm run plugin:new` scaffolder for a new built-in plugin.
- `release.sh` — `prepare_release` / `publish_release`, the two-step release flow.
- `.github/workflows/release-dmg.yml` — the CI job that actually builds, signs, notarizes, and publishes on a `v*` tag.

## How it works

**The script graph.** Three user-facing entry points each have a `pre*` hook that rebuilds
the native module for the right ABI and recompiles plugins:

- `dev` → `predev` runs `rebuild:electron` + `build:plugins`, then `electron-vite dev` (`package.json:9-10`).
- `start` → `prestart` runs the same, then `electron-vite preview` against the built output (`package.json:13-14`).
- `dist` → `predist` runs the same, then `electron-vite build && electron-builder --mac --publish always` (`package.json:23-24`).
- `test` → `pretest` runs `rebuild:node` (Node ABI, not Electron) + `build:plugins`, then `vitest run` (`package.json:19-20`).
- `dist:linux` → `predist:linux` rebuilds for Electron and compiles plugins, then electron-builder produces `dist/linux-unpacked` with `--publish never` (`package.json:25-26`).
- `verify:linux-package` checks the Linux executable and packaged x64 GNU native modules (`package.json:27`, `scripts/verify-linux-package.mjs:15-33`).

`typecheck` runs the renderer, Node, and plugin TypeScript project configs explicitly
(`package.json:15-18`). The root `tsconfig.json` only contains project references, so invoking
`tsc --noEmit` against it directly would check no source files and could miss renderer errors
that otherwise become blank-window crashes at runtime.

`build` itself (`package.json:11`) is `electron-vite build && npm run build:plugins` with no
native rebuild — it produces JS only.

**electron-vite (main / preload / renderer).** `electron.vite.config.ts` defines all three
targets in one `defineConfig`. **main** (`electron.vite.config.ts:5`) emits to `out/main`
with two rollup inputs — `src/main/app/index.ts` (the Electron main process) and
`src/plugin-host/index.ts` (the plugin host) — and uses `externalizeDepsPlugin` to keep
`dependencies` un-bundled, *excluding* `electron-updater` so it is bundled. **preload**
(`:17`) emits `out/preload/index.js` from `src/preload/index.ts`, also externalizing deps.
**renderer** (`:28`) roots at `src/`, builds `src/renderer/index.html` to `out` with
`emptyOutDir: false` (so it doesn't wipe `out/main` and `out/preload`), and pre-bundles
React. The `main` field in `package.json:5` points Electron at `out/main/index.js`.

**Native-module rebuild story.** `better-sqlite3` ships a prebuilt `.node` binary compiled
for one `NODE_MODULE_VERSION`; load it under the wrong ABI and it throws. Manifold therefore
keeps two rebuild scripts:

- `rebuild:electron` (`package.json:30`) = `npx electron-rebuild -f -o better-sqlite3` — rebuilds against the bundled Electron's ABI. Used by `predev`/`prestart`/`predist` because those load SQLite inside Electron.
- `rebuild:node` (`package.json:29`) = `node scripts/rebuild-better-sqlite3-node.mjs` — rebuilds against the current **Node** ABI, used by `pretest`/`pretest:watch` because vitest runs under Node. The script is *conditional*: `betterSqlite3Loads()` (`rebuild-better-sqlite3-node.mjs:34`) opens an in-memory DB and the script exits early if SQLite already loads (`:7`); only on the known ABI/bindings errors does it shell out to `npm rebuild better-sqlite3` with `build_from_source` and an isolated cache (`:14-22`), then re-checks and throws if still unloadable (`:24-26`). The load probe runs in a **fresh Node subprocess** (`spawnSync`, `:36`), not in-process: once a process has failed to load the wrong-ABI binary, Node can't re-`dlopen` the rebuilt addon in that same process (it throws "Module did not self-register"), so an in-process re-check would false-negative on every Electron→Node flip — the exact "ran the app, now run tests" case.

**Why install always builds from source.** `better-sqlite3`'s own install script is
`prebuild-install || node-gyp rebuild --release`: it normally downloads a prebuilt binary and
only falls back to a `node-gyp` source build if that fails. `prebuild-install` is deprecated
("no longer maintained"), so an npm override (`package.json:145`) aliases it to a tiny no-bin
package (`fast-deep-equal`, already in the tree). With no `prebuild-install` binary on `PATH`,
the install command always errors and falls through to the `node-gyp` source build. That build
is redundant with — and immediately re-done by — the ABI-specific `rebuild:*` hooks above, so
it costs only the first install's compile, and it removes the `npm warn deprecated
prebuild-install` warning (issue #361).

`postinstall` (`package.json:28`) separately `chmod +x`'s node-pty's `spawn-helper`, and
`npmRebuild: false` in the build block (`package.json:63`) tells electron-builder **not** to
rebuild natives during packaging — the `pre*`/CI rebuild steps own that.

**Worktree bootstrap & doctor.** A fresh (or symlinked) worktree isn't runnable until the right
steps run in the right order, so two scripts front that. `bootstrap` (`package.json:7` →
`scripts/setup-worktree.sh`) refuses a symlinked `node_modules`, runs `npm install`, asserts the
Electron binary actually downloaded — `node_modules/electron/path.txt` and the `dist/` binary it
names, whose absence is the `Error: Electron uninstall` symptom (`setup-worktree.sh:24-35`) — then
runs `rebuild:electron`, enables local `git rerere` (with `autoupdate`, so recurring conflict
resolutions replay hands-free — issue #835), and finishes by calling `doctor`. `doctor`
(`package.json:8` → `scripts/doctor.mjs`) runs five checks (`runDoctor`, `doctor.mjs:220`): deps
installed (`checkDependencies`), Electron binary present (`checkElectron`), which ABI
`better-sqlite3` loads under the current Node — it `require`s it and, on a mismatch, parses the
built-for `NODE_MODULE_VERSION` from the error (`classifyAbiError`, `doctor.mjs:92`) — whether `out/` is
stale (newest `src/` mtime vs newest `out/` mtime, `checkBuildOutput`), and whether `git rerere` is
enabled (`checkGitRerere`, `doctor.mjs:204` — `warn` when a worktree predates bootstrap). It exits
non-zero only on a hard failure (missing deps or Electron binary); stale `out/` and the
Electron-vs-Node ABI state are informational because the `pre*` hooks flip them automatically, while
rerere only `warn`s (with an `npm run bootstrap` hint) since re-running bootstrap re-enables it. A
repo-root `.gitattributes` also gives `docs/architecture/*.md` a `merge=union` so the wiki's
churn-prone `updated:` frontmatter stops raising merge conflicts (#835).

**Plugin compilation.** `build:plugins` (`package.json:12`) runs
`scripts/build-plugins.mjs`. `buildPlugins()` (`build-plugins.mjs:14`) walks
`resources/plugins/`, and for every folder with a `src/` and a `package.json` it reads the
manifest's `main` field, derives the TS entry (`out/plugin.js` → `src/plugin.ts`), and
esbuild-bundles it as a Node CJS module targeting `node20`
(`build-plugins.mjs:32-41`). The modules `manifold` and `vscode` are marked **external**
(`:39`) — they are injected at runtime by the plugin host's require interceptor, never
bundled. If a plugin has a `src/webview/index.tsx`, it is additionally bundled as a browser
IIFE to `out/webview.js` (`:45-57`). The bundled `out/` lives next to each plugin's source
in `resources/plugins/`, which is what `extraResources` then ships.

**Codex skill sync.** `sync:codex-skills` (`package.json:31`) runs
`scripts/sync-codex-skills.mjs`, which treats `.claude/skills/` as the checked-in source of
truth, copies every first-level skill directory into `~/.codex/skills/` (`sync-codex-skills.mjs:24-47`),
and applies targeted Codex rewrites for skills that need installed-path adjustments
(`sync-codex-skills.mjs:56-74`).

**Packaging (electron-builder).** The `build` block (`package.json:60`) sets `appId`
`de.malvik.manifold.app`, outputs to `dist/`, and includes only `out/**` in the asar
(`:67-69`). `extraResources` (`:70-75`) copies one tree *outside* the asar into the app's
`Resources/`: **`resources/plugins` → `plugins`** — this is how the compiled built-in
plugins reach the packaged app. The `mac`
target (`:76`) enables `hardenedRuntime` + `notarize`, points at
`build/entitlements.mac.plist`, and builds `dmg` and `zip` for both `arm64` and `x64`. The
`publish` provider is the GitHub repo configured in `package.json` (`:113-117`), read by
`electron-updater`.

The Linux target is an unpacked x64 directory rather than AppImage (`package.json:100-108`).
`install-linux.sh` verifies and stages that directory before transactionally replacing the app
and launcher (`install-linux.sh:37-85`). Pull requests and `main` pushes run the
non-publishing Linux build and verifier on Ubuntu (`.github/workflows/ci-linux.yml:1-46`);
downloadable release artifacts remain macOS-only.

**Release flow (`release.sh`).** The script takes one of `patch`/`minor`/`major`/`publish`
(`release.sh:250-256`) and, after asserting a clean worktree, configured `origin`, and an
authenticated `gh` (`:258-276`), branches into two paths:

- *Prepare* (`prepare_release`, `release.sh:129`): fetches `origin/main`, computes the next version from main's `package.json`, creates `release/v<next>` off `origin/main`, runs `npm version <type> --no-git-tag-version`, commits the bump, pushes, and opens (or reuses) a `gh pr create` against `main` (`:178-212`). It does **not** tag.
- *Publish* (`publish_release`, `release.sh:219`): run *after* the bump PR is merged. Re-fetches `origin/main`, reads its now-bumped version, guards that the tag/release don't already exist (`:230-231`), then `git tag -a v<version>` at `origin/main`'s SHA, pushes the tag, and `gh release create --verify-tag --generate-notes` (`:233-239`).

Pushing the `v*` tag is the trigger for the real build: `release-dmg.yml` runs on
`push: tags: v*` (`release-dmg.yml:6-7`), does `npm ci`, `npm run typecheck`, `npm test`,
`rebuild:electron`, then `npm run build` + `npx electron-builder --mac --publish never`
with the Apple signing/notarization secrets, and uploads the `.dmg`/`.zip`/`.yml`/`.blockmap`
to the GitHub release (`release-dmg.yml:38-59`). So locally `dist` exists for one-off
packaging, but the canonical release artifacts come from CI on tag push.

## Key types and entry points

- `dev` / `build` / `start` / `dist` — `package.json:10`, `:11`, `:14`, `:24`. The four entry points; each (except `build`) is preceded by a `pre*` rebuild hook.
- `typecheck:node` / `typecheck:web` / `typecheck:plugins` — `package.json:16-18`. Three project-scoped `tsc --noEmit` runs over, respectively: main + preload + shared + plugin-host (`tsconfig.node.json`), renderer + renderer-shared + shared (`tsconfig.web.json`), and `resources/plugins/*/src` (`tsconfig.plugins.json`). Plain `typecheck` (`package.json:15`) is a no-op solution-style `tsc` referencing only node + web.
- `bootstrap` / `doctor` — `package.json:7` / `:8` → `scripts/setup-worktree.sh` / `scripts/doctor.mjs`. One-step worktree setup and the environment health report.
- `rebuild:electron` / `rebuild:node` — `package.json:30` / `:29`. The two ABI targets for `better-sqlite3`.
- `sync:codex-skills` — `package.json:31` → `scripts/sync-codex-skills.mjs`. Refreshes Codex's installed copies of every checked-in skill.
- `buildPlugins()` — `scripts/build-plugins.mjs:14`. The esbuild plugin compiler; CLI-invoked via `build:plugins`.
- `plugin:new` — `package.json:32` → `scripts/new-plugin.mjs`. Scaffolds `resources/plugins/<publisher>.<name>/` with a manifest + `src/plugin.ts`.
- `prepare_release` / `publish_release` — `release.sh:129` / `:219`. The two release sub-commands.

## Interactions

- **Plugin host** (`src/plugin-host`): consumes the esbuild output. `build:plugins` marks `manifold`/`vscode` external because the host's require interceptor injects them at activation (`activator.ts`); `extraResources` ships the compiled `resources/plugins/` into the packaged app.
- **electron-updater** (dependency): the one dep deliberately *bundled* (excluded from `externalizeDepsPlugin` in main, `electron.vite.config.ts:6`); it reads the `publish` GitHub config (`package.json:113`) and the `.yml`/`.blockmap` files CI uploads.
- **better-sqlite3** (`src/main` storage layer): the native module the whole rebuild story exists for; loaded under Electron at runtime and under Node in vitest.
- **Tests** (`vitest`): `test` runs `vitest run` after `pretest` rebuilds for Node and compiles plugins; `build-plugins.test.ts`, `sync-codex-skills.test.ts`, and `new-plugin`-adjacent tests live in `scripts/`.
- **CI** (`.github/workflows/release-dmg.yml`): the only place signing/notarization runs (Apple secrets); triggered by the tag `release.sh publish` pushes.

## Invariants & gotchas

- **Two ABIs, two scripts.** Tests use `rebuild:node`; the app (`dev`/`start`/`dist`) uses `rebuild:electron`. Running tests after `npm run dev` (or vice-versa) leaves SQLite built for the wrong ABI — the `pre*` hooks exist precisely to flip it back, and the node rebuild self-checks so it's a near-no-op when already correct (`rebuild-better-sqlite3-node.mjs:7`).
- **`emptyOutDir: false` on the renderer is load-bearing.** The renderer writes into `out/` alongside `out/main` and `out/preload`; emptying it would delete the other two targets (`electron.vite.config.ts:44`).
- **`npmRebuild: false` means packaging never rebuilds natives.** electron-builder trusts that `predist`/CI already rebuilt `better-sqlite3` for Electron; if that step is skipped the packaged app ships a Node-ABI binary that won't load (`package.json:63`).
- **`extraResources` ships plugins *outside* the asar.** Only `out/**` goes in the asar (`package.json:67-69`); the compiled `resources/plugins/` is copied to `Resources/plugins` so the host can load it from a real directory, not the archive.
- **`build:plugins` derives the TS entry from each manifest's `main`.** A manifest whose `main` points at a path with no matching `src/<name>.ts` throws (`build-plugins.mjs:28`); the convention is `main: ./out/plugin.js` ↔ `src/plugin.ts` (see `new-plugin.mjs:38`).
- **`.claude/skills/` is the source for checked-in skills.** After changing a repo skill, run `npm run sync:codex-skills` so Codex's installed copy is refreshed; the sync keeps unrelated user-installed Codex skills intact and only replaces matching checked-in skill names.
- **`release.sh` prepare never tags; publish never bumps.** The bump lands via merged PR; the tag is created only by `publish` from `origin/main`'s SHA. Running `publish` before the bump PR merges tags the *old* version. Both halves require a clean worktree and abort otherwise (`release.sh:23-33`, `:271`).
- **The real artifacts come from CI, not local `dist`.** Signing/notarization secrets only exist in the `release` GitHub environment; the local `dist` script (`--publish always`) is for developer-side packaging, while tag-triggered `release-dmg.yml` (`--publish never` + explicit upload) produces the published `.dmg`.
- **Linux package verification is glibc-specific.** The supported WSL2 target requires the GNU x64 canvas binary plus Electron-compatible `node-pty` and `better-sqlite3` modules (`scripts/verify-linux-package.mjs:15-33`).
