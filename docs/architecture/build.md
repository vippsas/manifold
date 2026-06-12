---
description: How Manifold is built, type-checked, tested, packaged into a macOS .dmg, and released — the npm scripts, electron-vite bundling, native-module rebuilds, plugin compilation, and the two-step release flow.
covers: [package.json]
updated: 2026-06-12
owner: see .github/CODEOWNERS
---

# Build & release — npm scripts, electron-vite, native rebuilds, and the .dmg pipeline

Manifold is an Electron app bundled with **electron-vite** (three independent builds:
main, preload, renderer) plus a separate **esbuild** pass that compiles the built-in
plugins under `resources/plugins/`. Its only native dependency, `better-sqlite3`, must be
rebuilt against whichever runtime will load it (Node for tests, Electron for the app), so
nearly every entry-point script is fronted by a `pre*` rebuild hook. Packaging is
electron-builder producing signed/notarized macOS `.dmg` + `.zip`, and a release is a
two-step `release.sh` dance: prepare a version-bump PR, then (after merge) push a `v*` tag
that the GitHub Actions workflow turns into the actual build.

## Covered code

- `package.json` — the `scripts` block (lines 6–27) and the `build` block (electron-builder config, lines 52–105). The primary owner of this page.
- `electron.vite.config.ts` — the three-target electron-vite config (main / preload / renderer).
- `scripts/build-plugins.mjs` — `buildPlugins()`, the esbuild compiler for built-in plugins.
- `scripts/rebuild-better-sqlite3-node.mjs` — conditional rebuild of `better-sqlite3` for the **Node** runtime (tests).
- `scripts/new-plugin.mjs` — `npm run plugin:new` scaffolder for a new built-in plugin.
- `release.sh` — `prepare_release` / `publish_release`, the two-step release flow.
- `.github/workflows/release-dmg.yml` — the CI job that actually builds, signs, notarizes, and publishes on a `v*` tag.

## How it works

**The script graph.** Three user-facing entry points each have a `pre*` hook that rebuilds
the native module for the right ABI and recompiles plugins:

- `dev` → `predev` runs `rebuild:electron` + `build:plugins`, then `electron-vite dev` (`package.json:7-8`).
- `start` → `prestart` runs the same, then `electron-vite preview` against the built output (`package.json:11-12`).
- `dist` → `predist` runs the same, then `electron-vite build && electron-builder --mac --publish always` (`package.json:21-22`).
- `test` → `pretest` runs `rebuild:node` (Node ABI, not Electron) + `build:plugins`, then `vitest run` (`package.json:17-18`).

`build` itself (`package.json:9`) is `electron-vite build && npm run build:plugins` with no
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

- `rebuild:electron` (`package.json:25`) = `npx electron-rebuild -f -o better-sqlite3` — rebuilds against the bundled Electron's ABI. Used by `predev`/`prestart`/`predist` because those load SQLite inside Electron.
- `rebuild:node` (`package.json:24`) = `node scripts/rebuild-better-sqlite3-node.mjs` — rebuilds against the current **Node** ABI, used by `pretest`/`pretest:watch` because vitest runs under Node. The script is *conditional*: it first tries to open an in-memory DB (`rebuild-better-sqlite3-node.mjs:7`, `canLoadBetterSqlite3()` at `:28`) and exits early if SQLite already loads; only on the known ABI/bindings errors does it shell out to `npm rebuild better-sqlite3` with `build_from_source` and an isolated cache (`:14-22`). It re-checks afterward and throws if still unloadable (`:24-26`).

`postinstall` (`package.json:23`) separately `chmod +x`'s node-pty's `spawn-helper`, and
`npmRebuild: false` in the build block (`package.json:55`) tells electron-builder **not** to
rebuild natives during packaging — the `pre*`/CI rebuild steps own that.

**Plugin compilation.** `build:plugins` (`package.json:10`) runs
`scripts/build-plugins.mjs`. `buildPlugins()` (`build-plugins.mjs:14`) walks
`resources/plugins/`, and for every folder with a `src/` and a `package.json` it reads the
manifest's `main` field, derives the TS entry (`out/plugin.js` → `src/plugin.ts`), and
esbuild-bundles it as a Node CJS module targeting `node20`
(`build-plugins.mjs:32-41`). The modules `manifold` and `vscode` are marked **external**
(`:39`) — they are injected at runtime by the plugin host's require interceptor, never
bundled. If a plugin has a `src/webview/index.tsx`, it is additionally bundled as a browser
IIFE to `out/webview.js` (`:45-57`). The bundled `out/` lives next to each plugin's source
in `resources/plugins/`, which is what `extraResources` then ships.

**Packaging (electron-builder).** The `build` block (`package.json:52`) sets `appId`
`de.malvik.manifold.app`, outputs to `dist/`, and includes only `out/**` in the asar
(`:59-61`). `extraResources` (`:62-67`) copies one tree *outside* the asar into the app's
`Resources/`: **`resources/plugins` → `plugins`** — this is how the compiled built-in
plugins reach the packaged app. The `mac`
target (`:68`) enables `hardenedRuntime` + `notarize`, points at
`build/entitlements.mac.plist`, and builds `dmg` and `zip` for both `arm64` and `x64`. The
`publish` provider is the GitHub repo configured in `package.json` (`:96-100`), read by
`electron-updater`.

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

- `dev` / `build` / `start` / `dist` — `package.json:8`, `:9`, `:12`, `:22`. The four entry points; each (except `build`) is preceded by a `pre*` rebuild hook.
- `typecheck:node` / `typecheck:web` / `typecheck:plugins` — `package.json:14-16`. Three project-scoped `tsc --noEmit` runs over, respectively: main + preload + shared + plugin-host (`tsconfig.node.json`), renderer + renderer-shared + shared (`tsconfig.web.json`), and `resources/plugins/*/src` (`tsconfig.plugins.json`). Plain `typecheck` (`package.json:13`) is a no-op solution-style `tsc` referencing only node + web.
- `rebuild:electron` / `rebuild:node` — `package.json:25` / `:24`. The two ABI targets for `better-sqlite3`.
- `buildPlugins()` — `scripts/build-plugins.mjs:14`. The esbuild plugin compiler; CLI-invoked via `build:plugins`.
- `plugin:new` — `package.json:26` → `scripts/new-plugin.mjs`. Scaffolds `resources/plugins/<publisher>.<name>/` with a manifest + `src/plugin.ts`.
- `prepare_release` / `publish_release` — `release.sh:129` / `:219`. The two release sub-commands.

## Interactions

- **Plugin host** (`src/plugin-host`): consumes the esbuild output. `build:plugins` marks `manifold`/`vscode` external because the host's require interceptor injects them at activation (`activator.ts`); `extraResources` ships the compiled `resources/plugins/` into the packaged app.
- **electron-updater** (dependency): the one dep deliberately *bundled* (excluded from `externalizeDepsPlugin` in main, `electron.vite.config.ts:6`); it reads the `publish` GitHub config (`package.json:100`) and the `.yml`/`.blockmap` files CI uploads.
- **better-sqlite3** (`src/main` storage layer): the native module the whole rebuild story exists for; loaded under Electron at runtime and under Node in vitest.
- **Tests** (`vitest`): `test` runs `vitest run` after `pretest` rebuilds for Node and compiles plugins; `build-plugins.test.ts` and `new-plugin`-adjacent tests live in `scripts/`.
- **CI** (`.github/workflows/release-dmg.yml`): the only place signing/notarization runs (Apple secrets); triggered by the tag `release.sh publish` pushes.

## Invariants & gotchas

- **Two ABIs, two scripts.** Tests use `rebuild:node`; the app (`dev`/`start`/`dist`) uses `rebuild:electron`. Running tests after `npm run dev` (or vice-versa) leaves SQLite built for the wrong ABI — the `pre*` hooks exist precisely to flip it back, and the node rebuild self-checks so it's a near-no-op when already correct (`rebuild-better-sqlite3-node.mjs:7`).
- **`emptyOutDir: false` on the renderer is load-bearing.** The renderer writes into `out/` alongside `out/main` and `out/preload`; emptying it would delete the other two targets (`electron.vite.config.ts:44`).
- **`npmRebuild: false` means packaging never rebuilds natives.** electron-builder trusts that `predist`/CI already rebuilt `better-sqlite3` for Electron; if that step is skipped the packaged app ships a Node-ABI binary that won't load (`package.json:55`).
- **`extraResources` ships plugins *outside* the asar.** Only `out/**` goes in the asar (`package.json:59`); the compiled `resources/plugins/` is copied to `Resources/plugins` so the host can load it from a real directory, not the archive.
- **`build:plugins` derives the TS entry from each manifest's `main`.** A manifest whose `main` points at a path with no matching `src/<name>.ts` throws (`build-plugins.mjs:28`); the convention is `main: ./out/plugin.js` ↔ `src/plugin.ts` (see `new-plugin.mjs:38`).
- **`release.sh` prepare never tags; publish never bumps.** The bump lands via merged PR; the tag is created only by `publish` from `origin/main`'s SHA. Running `publish` before the bump PR merges tags the *old* version. Both halves require a clean worktree and abort otherwise (`release.sh:23-33`, `:271`).
- **The real artifacts come from CI, not local `dist`.** Signing/notarization secrets only exist in the `release` GitHub environment; the local `dist` script (`--publish always`) is for developer-side packaging, while tag-triggered `release-dmg.yml` (`--publish never` + explicit upload) produces the published `.dmg`.
