# Built-in Plugins as First-Class (TS pipeline + shipped in release) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make first-party plugins first-class citizens of the Manifold codebase: authored in TypeScript under `resources/plugins/<id>/src/`, compiled by a build step into `out/` (a gitignored artifact), shipped inside every packaged release via `extraResources`, with a `plugin:new` scaffold and an authoring guide.

**Architecture:** Built-in plugins already live in `resources/plugins/` and are discovered with `origin: 'builtin'` by the existing scanner. Three gaps remain: (1) they aren't copied into the packaged app (`extraResources` lacks a `plugins` entry); (2) there's no build step — current samples are hand-written JS with committed `out/`; (3) there's no authoring ergonomics (types, scaffold, docs). This plan adds a small **esbuild** build script (`scripts/build-plugins.mjs`) that compiles each plugin's `src/` → its manifest `main` path (marking `manifold`/`vscode` external — they're injected at runtime by the require interceptor), wires it into the npm lifecycle so `out/` is always fresh for dev/test/package, ships `resources/plugins` via `extraResources`, and provides a typed scaffold + guide. The `hello` sample is converted to the new layout to dogfood it; `hello-vscode` stays a committed prebuilt fixture (it represents an unmodified external `.vsix`, and B2 loads it from disk).

**Tech Stack:** esbuild 0.25.12 (already a dependency), electron-vite, electron-builder (the `build` key in `package.json`), TypeScript, Vitest. Node entry: ESM `.mjs` build script.

---

## Context for the implementer (read once)

- **`src/main/plugins/plugin-paths.ts`** — `getBundledPluginsDir()` returns `process.resourcesPath/plugins` when `app.isPackaged`, else `resources/plugins` in the source tree. Do NOT change it; the packaging task makes the packaged path real.
- **`package.json`** — packager is electron-builder. Relevant keys: `scripts` (`build`, `dev`, `predev`, `prestart`, `pretest`, `predist`, `dist`), and `build` (electron-builder config) with `files: ["out/**/*"]` and `extraResources: [{ from: "resources/skills/watch", to: "skills/watch" }]`. You will add a `plugins` entry mirroring the skills one.
- **`resources/plugins/hello/`** — Manifold-native sample: `package.json` (`engines.manifold`, `main: ./out/plugin.js`, contributes views/commands/configuration, capabilities) + hand-written `out/plugin.js`. This is what you convert to TS.
- **`resources/plugins/hello-vscode/`** — VS Code-style fixture: `package.json` (`engines.vscode`) + hand-written `out/extension.js`. **Leave this as-is** (committed prebuilt). `src/main/plugins/vscode-shim-integration.test.ts` (B2) requires `resources/plugins/hello-vscode/out/extension.js` from disk.
- **Shared API types** live in `src/shared/plugins/api-types.ts` (`ManifoldApi`, `ManifoldContext`, `Disposable`, …). Plugin TS authors should get these types for `require('manifold')`.
- **`.gitignore`** has a global `out/` rule (line 2). Built plugin `out/` stays ignored (it's an artifact). `hello-vscode/out/extension.js` is already force-added (tracked despite the rule) — keep it tracked.
- **Verification gate (unchanged):** runtime tests green; `npm run typecheck:node` ≤ 16 errors and `typecheck:web` ≤ 37 (baseline), no new errors in touched files.

**Out of scope:** Phase C/D vscode shim work; an Open VSX installer/updater; user-plugin install UX. This is only about *first-party built-in* plugins shipping in releases.

---

## File Structure

**New files**
- `scripts/build-plugins.mjs` — esbuild bundler for `resources/plugins/*/src` → `out`.
- `scripts/build-plugins.test.mjs` (or a vitest test under `scripts/`) — verifies the build script compiles a fixture and respects externals.
- `scripts/new-plugin.mjs` — scaffolds a new Manifold-native plugin.
- `tsconfig.plugins.json` — typechecks plugin sources against the shared API types.
- `src/shared/plugins/manifold-module.d.ts` — ambient `declare module 'manifold'` so plugin TS is typed.
- `resources/plugins/hello/src/plugin.ts` — the converted sample (replaces the hand-written `out/plugin.js` as the source of truth).
- `docs/plugins/authoring.md` — the authoring guide / contract.

**Modified files**
- `package.json` — add `build:plugins`, `plugin:new`, `typecheck:plugins` scripts; thread `build:plugins` into `build`/`predev`/`prestart`/`pretest`/`predist`; add the `extraResources` plugins entry.
- `.gitignore` — (no change expected; verify built `out/` stays ignored, `hello-vscode/out` stays tracked).
- Remove from git tracking: `resources/plugins/hello/out/plugin.js` (becomes a build artifact).

---

## Task BP1: esbuild plugin build script

**Files:**
- Create: `scripts/build-plugins.mjs`
- Test: `scripts/build-plugins.test.ts` (vitest, run via the existing runner)

- [ ] **Step 1: Write the failing test**

Create `scripts/build-plugins.test.ts`:

```typescript
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlugins } from './build-plugins.mjs'

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mf-buildplugins-'))
  // plugin WITH src → should be built
  const a = join(root, 'alpha')
  mkdirSync(join(a, 'src'), { recursive: true })
  writeFileSync(join(a, 'package.json'), JSON.stringify({ name: 'alpha', publisher: 'm', version: '1.0.0', engines: { manifold: '^0.3.0' }, main: './out/plugin.js' }))
  writeFileSync(join(a, 'src', 'plugin.ts'), `const manifold = require('manifold'); export function activate(){ manifold.commands.registerCommand('a.x', () => 1) }`)
  // plugin WITHOUT src (prebuilt) → should be skipped, its out left untouched
  const b = join(root, 'beta')
  mkdirSync(join(b, 'out'), { recursive: true })
  writeFileSync(join(b, 'package.json'), JSON.stringify({ name: 'beta', publisher: 'm', version: '1.0.0', engines: { vscode: '^1.104.0' }, main: './out/extension.js' }))
  writeFileSync(join(b, 'out', 'extension.js'), 'module.exports={activate(){}}\n')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('buildPlugins', () => {
  it('compiles plugins that have a src/ dir to their manifest main path', async () => {
    const built = await buildPlugins(root)
    expect(built).toContain('alpha')
    const out = join(root, 'alpha', 'out', 'plugin.js')
    expect(existsSync(out)).toBe(true)
    const code = readFileSync(out, 'utf8')
    expect(code).toContain('a.x')                 // our code is present
    expect(code).toContain("require('manifold')") // manifold left EXTERNAL, not bundled/resolved
  })

  it('skips plugins without a src/ dir (prebuilt) and leaves their out untouched', async () => {
    const built = await buildPlugins(root)
    expect(built).not.toContain('beta')
    expect(readFileSync(join(root, 'beta', 'out', 'extension.js'), 'utf8')).toBe('module.exports={activate(){}}\n')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scripts/build-plugins.test.ts`
Expected: FAIL — `build-plugins.mjs` / `buildPlugins` not found.

- [ ] **Step 3: Implement the build script**

Create `scripts/build-plugins.mjs`:

```javascript
// scripts/build-plugins.mjs — compiles each built-in plugin's src/ → its manifest `main` path.
// `manifold` and `vscode` are marked EXTERNAL: they are injected at runtime by the
// plugin host's require interceptor, never bundled.
import { build } from 'esbuild'
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PLUGINS_DIR = resolve(HERE, '..', 'resources', 'plugins')

/** Build every plugin under `pluginsDir` that has a `src/` directory.
 *  Returns the list of plugin folder names that were built. */
export async function buildPlugins(pluginsDir = DEFAULT_PLUGINS_DIR) {
  if (!existsSync(pluginsDir)) return []
  const built = []
  for (const entry of readdirSync(pluginsDir)) {
    const root = join(pluginsDir, entry)
    if (!statSync(root).isDirectory()) continue
    const srcDir = join(root, 'src')
    const manifestPath = join(root, 'package.json')
    if (!existsSync(srcDir) || !existsSync(manifestPath)) continue // prebuilt or not a plugin → skip

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const main = typeof manifest.main === 'string' ? manifest.main : './out/extension.js'
    const outfile = resolve(root, main)
    // Source entry: src/<basename-of-main>.ts (e.g. main ./out/plugin.js → src/plugin.ts)
    const entryTs = join(srcDir, basename(main).replace(/\.js$/, '.ts'))
    if (!existsSync(entryTs)) {
      throw new Error(`[build-plugins] ${entry}: expected source entry ${entryTs} (derived from manifest main "${main}")`)
    }

    await build({
      entryPoints: [entryTs],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node20',
      external: ['manifold', 'vscode'],
      logLevel: 'warning',
    })
    built.push(entry)
  }
  return built
}

// Run directly: `node scripts/build-plugins.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  buildPlugins()
    .then((b) => { console.log(`[build-plugins] built ${b.length} plugin(s): ${b.join(', ') || '(none)'}`) })
    .catch((err) => { console.error('[build-plugins] failed:', err); process.exit(1) })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/build-plugins.test.ts`
Expected: PASS (2 tests). If vitest doesn't pick up `scripts/`, confirm the test glob includes it (it imports a `.mjs`; vitest handles ESM). If the import of a `.mjs` from a `.ts` test causes resolution issues, keep the test as `scripts/build-plugins.test.ts` and import via the relative `./build-plugins.mjs` specifier as written; report if the runner needs config.

- [ ] **Step 5: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add scripts/build-plugins.mjs scripts/build-plugins.test.ts && \
git commit -m "feat(plugins): esbuild build step for built-in plugin sources

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP2: Wire `build:plugins` into the npm lifecycle

**Files:**
- Modify: `package.json` (scripts only)

- [ ] **Step 1: Add scripts and thread the build step**

Edit `package.json` `scripts`. Add `build:plugins` and ensure the plugin `out/` is freshly built before dev, test, generic build, and packaging. Apply these exact changes (preserve all other scripts):

```jsonc
{
  "build:plugins": "node scripts/build-plugins.mjs",
  "build": "electron-vite build && npm run build:plugins",
  "predev": "npm run rebuild:electron && npm run build:plugins",
  "prestart": "npm run rebuild:electron && npm run build:plugins",
  "pretest": "npm run rebuild:node && npm run build:plugins",
  "predist": "npm run rebuild:electron && npm run build:plugins"
}
```

(The existing `predev`/`prestart` are `npm run rebuild:electron`; `pretest` is `npm run rebuild:node`; `predist` is `npm run rebuild:electron`. Append `&& npm run build:plugins` to each, and add `build:plugins` + extend `build`.)

- [ ] **Step 2: Verify the wiring runs the build**

Run: `npm run build:plugins`
Expected: `[build-plugins] built N plugin(s): …` (N may be 0 until BP5 adds `hello/src`; that's fine — it must exit 0).

Run: `npm run pretest` then `npm test` is heavy; instead just confirm `pretest` chains correctly: `npm run pretest` should run rebuild:node then build:plugins with exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add package.json && \
git commit -m "build(plugins): run build:plugins in dev/test/build/dist lifecycle

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP3: Ship built-in plugins in the packaged app (extraResources)

**Files:**
- Modify: `package.json` (`build.extraResources`)

- [ ] **Step 1: Add the plugins extraResources entry**

In `package.json`, under `build.extraResources`, add a second entry mirroring the existing skills one:

```jsonc
"extraResources": [
  { "from": "resources/skills/watch", "to": "skills/watch" },
  { "from": "resources/plugins", "to": "plugins" }
]
```

This copies `resources/plugins/**` into `Manifold.app/Contents/Resources/plugins`, which is exactly `process.resourcesPath/plugins` — the path `getBundledPluginsDir()` returns when `app.isPackaged`.

- [ ] **Step 2: Assert the config (cheap, deterministic)**

Add/confirm via a quick node check (no full packaging needed here):

Run:
```bash
node -e "const e=require('./package.json').build.extraResources; const ok=e.some(x=>x.from==='resources/plugins'&&x.to==='plugins'); if(!ok){console.error('missing plugins extraResources');process.exit(1)} console.log('extraResources plugins entry OK')"
```
Expected: `extraResources plugins entry OK`.

(A full `electron-builder --dir` unpacked build to visually confirm `Contents/Resources/plugins/` is the **owed** packaging verification — see the final task. It needs a full app build + native rebuild and isn't run as part of this task.)

- [ ] **Step 3: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add package.json && \
git commit -m "build(plugins): ship resources/plugins in packaged releases via extraResources

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP4: Typed authoring — ambient `manifold` module + tsconfig.plugins.json

**Files:**
- Create: `src/shared/plugins/manifold-module.d.ts`
- Create: `tsconfig.plugins.json`
- Modify: `package.json` (add `typecheck:plugins` script)

- [ ] **Step 1: Create the ambient module declaration**

Create `src/shared/plugins/manifold-module.d.ts` so `require('manifold')` / `import` is typed as the `ManifoldApi`:

```typescript
// Ambient typing for the runtime-injected `manifold` module (see plugin-host require interceptor).
declare module 'manifold' {
  import type { ManifoldApi } from './api-types'
  // CommonJS: `const manifold = require('manifold')` → ManifoldApi
  const api: ManifoldApi
  export = api
}
```

- [ ] **Step 2: Create the plugins tsconfig**

Create `tsconfig.plugins.json` (typechecks plugin sources against the shared types; emits nothing — esbuild does the build):

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "Node",
    "target": "ES2021",
    "lib": ["ES2021"],
    "types": [],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "manifold": ["./src/shared/plugins/manifold-module.d.ts"] }
  },
  "include": [
    "resources/plugins/*/src/**/*.ts",
    "src/shared/plugins/manifold-module.d.ts",
    "src/shared/plugins/api-types.ts"
  ]
}
```

- [ ] **Step 3: Add the typecheck script**

In `package.json` `scripts`, add:
```jsonc
"typecheck:plugins": "tsc --noEmit -p tsconfig.plugins.json"
```

- [ ] **Step 4: Verify it typechecks (currently zero plugin sources → must pass cleanly)**

Run: `npm run typecheck:plugins`
Expected: exit 0 (no `src/` plugins yet, or only `_` files — should be clean). If it errors because `include` matches nothing, that's acceptable as long as exit is 0; if tsc errors on "no inputs found", add an empty placeholder is NOT desired — instead this task is verified again at the end of BP5 once `hello/src/plugin.ts` exists. If "no inputs" causes a non-zero exit now, note it and proceed; BP5 adds the first source.

- [ ] **Step 5: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add src/shared/plugins/manifold-module.d.ts tsconfig.plugins.json package.json && \
git commit -m "feat(plugins): typed authoring — ambient manifold module + tsconfig.plugins

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP5: Dogfood — convert `hello` to the TS `src/` layout

**Files:**
- Create: `resources/plugins/hello/src/plugin.ts`
- Remove from git: `resources/plugins/hello/out/plugin.js` (becomes a build artifact)
- Test: existing `src/main/plugins/*.test.ts` must stay green; build + discovery verified

- [ ] **Step 1: Read the current hand-written sample**

Read `resources/plugins/hello/out/plugin.js` and `resources/plugins/hello/package.json`. The TS source you write must compile (via BP1's esbuild) to behavior **identical** to the current `out/plugin.js` (same command ids, same view html/webview behavior, same storage/config/workspace usage), because nothing should regress.

- [ ] **Step 2: Write the TS source**

Create `resources/plugins/hello/src/plugin.ts` — a typed port of the current `out/plugin.js`. Use the ambient types:

```typescript
import type { ManifoldContext } from 'manifold'
// runtime module injected by the host require interceptor:
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

export function activate(context: ManifoldContext): void {
  // PORT the exact behavior from the current out/plugin.js here, typed.
  // (commands.registerCommand, window.registerWebviewViewProvider, storage, workspace, configuration —
  //  whatever the existing sample does, preserved 1:1.)
}

export function deactivate(): void {}
```

Replace the body with a faithful, typed port of the existing `out/plugin.js`. Keep the manifest `main` (`./out/plugin.js`) unchanged so esbuild writes back to the same path.

- [ ] **Step 3: Build and confirm output is regenerated**

Run: `npm run build:plugins`
Expected: `built N plugin(s): … hello …`, and `resources/plugins/hello/out/plugin.js` is regenerated by esbuild.

- [ ] **Step 4: Stop tracking the now-generated out file**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git rm --cached resources/plugins/hello/out/plugin.js
```
Confirm `git status` shows `resources/plugins/hello/out/plugin.js` as deleted-from-index (it stays on disk, now gitignored as a build artifact) and `resources/plugins/hello/src/plugin.ts` as new. `resources/plugins/hello-vscode/out/extension.js` must remain tracked (do NOT untrack it).

- [ ] **Step 5: Typecheck the plugin source**

Run: `npm run typecheck:plugins`
Expected: exit 0, no errors in `resources/plugins/hello/src/plugin.ts`. Fix any typing issues in the port (the ambient `manifold` module gives you `ManifoldApi`).

- [ ] **Step 6: Run the plugin test suite + node typecheck**

Run: `npx vitest run src/main/plugins src/plugin-host src/shared/plugins`
Expected: all green (88 — B2 still loads the untouched `hello-vscode` prebuilt fixture; `hello` is now built from src but its behavior is unchanged).
Run: `npm run typecheck:node`
Expected: ≤ 16 (baseline).

- [ ] **Step 7: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add resources/plugins/hello/src/plugin.ts && \
git add -u resources/plugins/hello/out/plugin.js && \
git commit -m "refactor(plugins): author the hello sample in TypeScript (dogfood the pipeline)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP6: Scaffold + authoring guide

**Files:**
- Create: `scripts/new-plugin.mjs`
- Modify: `package.json` (add `plugin:new` script)
- Create: `docs/plugins/authoring.md`

- [ ] **Step 1: Write the scaffold script**

Create `scripts/new-plugin.mjs` — generates a Manifold-native plugin skeleton:

```javascript
// scripts/new-plugin.mjs — scaffold a new built-in Manifold plugin.
// Usage: npm run plugin:new -- <name> [--publisher manifold]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGINS = resolve(HERE, '..', 'resources', 'plugins')

const args = process.argv.slice(2)
const name = args.find((a) => !a.startsWith('--'))
const publisher = (args[args.indexOf('--publisher') + 1] && !args[args.indexOf('--publisher') + 1].startsWith('--')) ? args[args.indexOf('--publisher') + 1] : 'manifold'
const ID_SEG = /^[a-z0-9][a-z0-9-]*$/
if (!name || !ID_SEG.test(name)) { console.error('Usage: npm run plugin:new -- <name>  (name: lowercase alphanumeric + hyphens)'); process.exit(1) }

const dir = join(PLUGINS, `${publisher}.${name}`)
if (existsSync(dir)) { console.error(`already exists: ${dir}`); process.exit(1) }
mkdirSync(join(dir, 'src'), { recursive: true })

const manifest = {
  name, publisher, version: '0.0.1', displayName: name,
  engines: { manifold: '^0.3.0' }, main: './out/plugin.js',
  activationEvents: [`onCommand:${publisher}.${name}.hello`],
  capabilities: ['storage'],
  contributes: { commands: [{ command: `${publisher}.${name}.hello`, title: `${name}: Hello` }] },
}
writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(join(dir, 'src', 'plugin.ts'),
`import type { ManifoldContext } from 'manifold'
const manifold = require('manifold') as typeof import('manifold')

export function activate(context: ManifoldContext): void {
  const cmd = manifold.commands.registerCommand('${publisher}.${name}.hello', () => {
    void manifold.window // example: use the API
    return 'hello from ${name}'
  })
  context.subscriptions.push(cmd)
}

export function deactivate(): void {}
`)
console.log(`Created ${dir}\nNext: edit src/plugin.ts, then \`npm run build:plugins\` (or just \`npm run dev\`).`)
```

- [ ] **Step 2: Add the script**

In `package.json` `scripts`, add:
```jsonc
"plugin:new": "node scripts/new-plugin.mjs"
```

- [ ] **Step 3: Smoke the scaffold (then remove the throwaway)**

Run:
```bash
npm run plugin:new -- smoke-test && npm run build:plugins && \
test -f resources/plugins/manifold.smoke-test/out/plugin.js && echo "scaffold+build OK" && \
rm -rf resources/plugins/manifold.smoke-test
```
Expected: `scaffold+build OK`, and the throwaway dir removed (do not commit it).

- [ ] **Step 4: Write the authoring guide**

Create `docs/plugins/authoring.md` documenting the contract: directory layout (`resources/plugins/<publisher>.<name>/{package.json,src/plugin.ts}`), the manifest fields (`name`, `publisher`, `version`, `engines.manifold`, `main`, `activationEvents`, `capabilities`, `contributes`), the `manifold` API surface (commands/window/storage/workspace/configuration + which capability gates each), how `require('manifold')` is injected, the build (`npm run build:plugins`, auto-run in dev/test/dist), how built-ins ship (extraResources → `process.resourcesPath/plugins`), and the `npm run plugin:new` workflow. Note that VS Code-style plugins (`engines.vscode`, `require('vscode')`) are also supported but use the separate shim and are typically external/prebuilt.

- [ ] **Step 5: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add scripts/new-plugin.mjs package.json docs/plugins/authoring.md && \
git commit -m "feat(plugins): plugin:new scaffold + authoring guide

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task BP7: Whole-feature verification

**Files:** none (verification + doc note)

- [ ] **Step 1: Full gates**

Run, expecting all green:
- `npm run build:plugins` → builds `hello` (and any new), skips `hello-vscode`.
- `npx vitest run` (full suite) → green (note: `pretest` rebuilds native + plugins first).
- `npm run typecheck:node` (≤16), `npm run typecheck:web` (≤37), `npm run typecheck:plugins` (0).
- `npm run build` → `electron-vite build && build:plugins` succeed; `out/main/plugin-host.js` present; `resources/plugins/hello/out/plugin.js` present.

- [ ] **Step 2: Record the owed packaging + dev smoke**

Append to `docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md` a "Built-in plugins shipping — owed verification" note:
- **Packaging (Electron-only):** `npx electron-builder --dir` (unpacked, no sign/notarize) then confirm `dist/mac*/Manifold.app/Contents/Resources/plugins/hello/out/plugin.js` exists — proves built-ins ship. (Not runnable in CI here.)
- **Dev smoke:** `npm run dev` → `~/.manifold/debug.log` shows discovery of the built-in plugins (now built from `src/`), no skip errors.
- Mark the previously-held items (`extraResources`, `.gitignore`/`out` handling) as **resolved** by this work.

- [ ] **Step 3: Commit**

```bash
cd /Users/svenmalvik/.manifold/worktrees/manifold/manifold-plugins && \
git add docs/superpowers/plans/2026-06-04-manifold-plugins-followups.md && \
git commit -m "docs(plugins): record built-in-plugin packaging verification + close held items

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** ship built-ins in releases → BP3 (extraResources). Author in TS against types → BP1 (esbuild externals) + BP4 (ambient module + tsconfig). Build wired into lifecycle → BP2. Dogfood → BP5. Scaffold + docs → BP6. Verified → BP7. ✓

**Placeholder scan:** BP5 Step 2 intentionally says "port the exact behavior" rather than reproducing the sample's body — because the body must be read from the live `out/plugin.js` at implementation time (the implementer reads it in Step 1). All build/script/config code is complete and literal.

**Type/name consistency:** `buildPlugins(pluginsDir)` exported from `build-plugins.mjs` is used by the test and the CLI runner. `manifold-module.d.ts` declares `module 'manifold'` matching the `paths` alias in `tsconfig.plugins.json` and the `require('manifold')` runtime contract. esbuild `external: ['manifold','vscode']` matches the require-interceptor injection. `main` (manifest) drives both the esbuild `outfile` and the source-entry derivation (`src/<basename(main)>.ts`).

**Gotchas captured:** `hello-vscode` stays committed/prebuilt (B2 depends on its on-disk `out`); only `hello`'s `out` is untracked; `out/` stays globally gitignored; `build:plugins` is threaded into `pretest`/`predev` so the artifact exists for tests and dev; the real packaging proof is Electron-only and recorded as owed.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-04-manifold-builtin-plugins-pipeline.md`.**
