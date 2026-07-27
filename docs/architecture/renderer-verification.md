---
description: How an agent self-verifies renderer/theme changes — screenshot a single component under a real theme with no Electron, and drive the built app for flow-level checks. Covers the two scripts, their engine choices, the fixture convention, and how they reuse the app's theme conversion.
covers: [scripts/screenshot-component.mjs, scripts/drive-app.mjs]
updated: 2026-07-27
owner: see .github/CODEOWNERS
---

# Renderer verification — screenshot a component, drive the built app

UI changes used to be verified by a human pasting a screenshot ("show me in the browser").
Two checked-in scripts let an agent see its own renderer/theme work, so the human only
confirms taste, not correctness:

- **`npm run screenshot:component <Component> [--theme <id>]`** — render one renderer
  component under a real theme and capture a PNG, **without launching Electron**.
- **`npm run drive:app`** — launch the *built* Electron app under Playwright and assert on a
  rendered surface, for flow-level checks (the seams a single component can't exercise).

Both reuse the app's own code — the same [`loadTheme`](../../src/shared/themes/registry.ts)
conversion and the same [renderer build](build.md) esbuild pass — so what you capture matches
what ships.

## Covered code

| Path | Role |
| --- | --- |
| `scripts/screenshot-component.mjs` | Bundle a component + theme, capture a PNG (or emit HTML) |
| `scripts/drive-app.mjs` | Launch the built app under Playwright for flow assertions |
| `src/renderer/components/**/<Name>.fixture.tsx` | Optional per-component render fixture |

## One engine, one dependency

The only new dependency is **`playwright-core`** (no bundled browsers). Everything else is
already in the tree: **esbuild** (also used by [`build-plugins.mjs`](build.md)) bundles the
component, and the pinned **Electron** binary supplies Chromium for the driver.

- **Screenshot** uses a headless Chromium — *not* Electron, per the validation contract. It
  resolves a browser in this order: `SCREENSHOT_CHROMIUM`/`CHROME_PATH` → Playwright's managed
  Chromium (`npx playwright install chromium`) → the system Google Chrome (`channel: 'chrome'`,
  which most dev machines already have). This is the "Claude in Chrome" recipe made repeatable.
- **Driver** uses Playwright's `_electron.launch` against `out/main/index.js` with the pinned
  Electron binary — no browser download, deterministic Chromium version.

## `screenshot:component`

Pipeline (all steps but the capture are pure and unit-tested in
`scripts/screenshot-component.test.ts`):

1. **Resolve the target.** A co-located `<Name>.fixture.tsx` wins over the raw `<Name>.tsx`.
2. **Resolve the theme.** esbuild bundles `src/shared/themes/registry.ts`, imported in Node, so
   `loadTheme(id).cssVars` is the *exact* conversion the app applies. Unknown ids are rejected
   with the available list.
3. **Bundle.** esbuild compiles a tiny entry (React + the target + `theme.css`) into a browser
   IIFE; the theme's CSS variables are injected via `define` and applied with the app's own
   `applyThemeCssVars`. Fonts that `theme.css` `@font-face`s (the Seti icon font) are inlined as
   data URLs, so a webfont can't break the bundle or go missing in the capture.
4. **Assemble** a self-contained HTML page: a default `window.electronAPI` stub (every `invoke`
   resolves `[]`), the bundled CSS, a themed mount point, and the bundle.
5. **Capture** with headless Chromium (`page.screenshot`), or with `--emit-html` write the page
   and stop — open it in any browser (the repeatable "make an html so I can see it").

### The fixture convention

Most components need props and a main-process bridge, so they can't render bare. A
`<Name>.fixture.tsx` **default-exports** the component wired with props (a React element or a
zero-arg component) and may override `window.electronAPI` for specific data. See
[`NewAgentForm.fixture.tsx`](../../src/renderer/components/modals/NewAgentForm.fixture.tsx).
Prop-less components (e.g. `ManifoldWordmark`) render with no fixture.

### Flags

`--theme <id>` (default `manifold-dark`) · `--out <path>` · `--width` / `--height` ·
`--full` (full-page) · `--emit-html [path]` (skip the browser). Output defaults to
`screenshots/<Component>.<theme>.png` (git-ignored).

## `drive:app`

Requires a prior `npm run build`. `driverEnv()` strips `ELECTRON_RENDERER_URL` so the app loads
the built renderer via the production path in
[`window-factory.ts`](../../src/main/app/window-factory.ts) rather than an electron-vite dev
server. Import `launchBuiltApp()` to write your own assertions against the first window, or run
the CLI for a default smoke check (wait for `#root` to mount, screenshot). On headless Linux it
needs a display — run under `xvfb-run`.

## Limits

- The screenshot renders a component **in isolation**; cross-panel layout and real IPC data are
  the driver's job, not the screenshot's.
- The default `electronAPI` stub returns `[]` for every channel; a fixture must supply anything
  a component reads on mount to render a realistic state.
- A capture proves the component *renders* under a theme; a human still confirms taste.
