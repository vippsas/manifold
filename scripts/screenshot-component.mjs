// scripts/screenshot-component.mjs — `npm run screenshot:component <Component> [--theme <id>]`.
// Renders a single renderer component under a real Manifold theme and captures a PNG,
// WITHOUT launching the full Electron app. It reuses the app's own theme conversion
// (`loadTheme` from src/shared/themes) so the screenshot matches how the component looks
// in-app, esbuild-bundles the component the same way the renderer build does, and drives a
// headless Chromium via playwright-core. See docs/architecture/renderer-verification.md.
//
// Components that need props/context get a co-located `<Component>.fixture.tsx` (default-export
// a wired element or component). Prop-less components render with no fixture. A default
// `window.electronAPI` stub (every `invoke` resolves `[]`) lets components that talk to the
// main process mount without a live backend; fixtures can override it for specific data.
import * as esbuild from 'esbuild'
import { readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(HERE, '..')
const DEFAULT_THEME = 'manifold-dark'

// ── Argument parsing ───────────────────────────────────────────────

export function parseArgs(argv) {
  const args = { component: null, theme: DEFAULT_THEME, out: null, width: 900, height: 700, fullPage: false, emitHtml: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--theme') args.theme = argv[++i]
    else if (arg === '--out') args.out = argv[++i]
    else if (arg === '--width') args.width = Number(argv[++i])
    else if (arg === '--height') args.height = Number(argv[++i])
    else if (arg === '--full' || arg === '--full-page') args.fullPage = true
    else if (arg === '--emit-html') {
      // Optional path: consume the next token only when it isn't another flag.
      args.emitHtml = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    }
    else if (!arg.startsWith('--') && args.component === null) args.component = arg
  }
  return args
}

// ── Component / fixture resolution ─────────────────────────────────

/** Recursively collect files under `dir` whose basename is in `wanted`. */
function findFilesNamed(dir, wanted, found = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      findFilesNamed(full, wanted, found)
    } else if (wanted.has(entry.name)) {
      found.push(full)
    }
  }
  return found
}

/** Locate the component to render. A `<Name>.fixture.tsx` (a wired element/component) wins
 *  over the raw `<Name>.tsx`, letting components that need props/context be rendered. */
export function findTarget(componentName, { searchRoots }) {
  const fixtureName = `${componentName}.fixture.tsx`
  const componentFile = `${componentName}.tsx`
  const wanted = new Set([fixtureName, componentFile])
  const matches = searchRoots.flatMap((root) => findFilesNamed(root, wanted))

  const fixture = matches.find((f) => f.endsWith(fixtureName))
  if (fixture) return { kind: 'fixture', file: fixture, name: componentName }

  const component = matches.find((f) => f.endsWith(componentFile))
  if (component) return { kind: 'component', file: component, name: componentName }

  throw new Error(
    `No "${componentName}.fixture.tsx" or "${componentName}.tsx" found under ${searchRoots.join(', ')}.\n` +
      `Create a fixture next to the component that default-exports it wired with props, e.g.:\n` +
      `  export default <${componentName} ...props />`,
  )
}

// ── Theme resolution (reuses the app's real conversion) ────────────

/** esbuild-bundle src/shared/themes/registry.ts and import it in Node so the screenshot uses
 *  the exact `loadTheme` conversion the app uses (single source of truth). */
export async function loadThemeRegistry(repoRoot) {
  const result = await esbuild.build({
    stdin: {
      contents: `export { loadTheme, getThemeList } from './src/shared/themes/registry'`,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].text
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

/** Resolve a theme id to its CSS variables + type, validating against the real theme list. */
export async function loadThemeVars(repoRoot, themeId) {
  const { loadTheme, getThemeList } = await loadThemeRegistry(repoRoot)
  const ids = getThemeList().map((t) => t.id)
  if (!ids.includes(themeId)) {
    throw new Error(`Unknown theme "${themeId}". Available themes: ${ids.join(', ')}`)
  }
  const { cssVars, type } = loadTheme(themeId)
  return { cssVars, type, id: themeId }
}

// ── Component bundling (mirrors the renderer build) ────────────────

/** Build the tiny entry module that applies the theme and mounts the target. */
export function buildEntrySource(target, repoRoot) {
  // Import the target relative to repoRoot (esbuild's stdin resolveDir), matching how the
  // adapter/CSS below are imported — keeps the generated entry readable and portable.
  const rel = relative(repoRoot, target.file)
  const targetImport = rel.startsWith('.') ? rel : `./${rel}`

  const importAndResolve =
    target.kind === 'fixture'
      ? `import Target from ${JSON.stringify(targetImport)}
const node = React.isValidElement(Target) ? Target : React.createElement(Target)`
      : `import * as Mod from ${JSON.stringify(targetImport)}
const Target = Mod.default ?? Mod[${JSON.stringify(target.name)}]
if (!Target) throw new Error(${JSON.stringify(`${target.name}.tsx has no default export or export named "${target.name}"; add a ${target.name}.fixture.tsx`)})
const node = React.createElement(Target)`

  return `import React from 'react'
import { createRoot } from 'react-dom/client'
import { applyThemeCssVars } from './src/shared/themes/adapter'
import './src/renderer/styles/theme.css'
${importAndResolve}

applyThemeCssVars(__CSS_VARS__)
document.documentElement.style.colorScheme = __THEME_TYPE__
// Mirror the app's theme class (useTheme.ts) so light/dark-specific CSS rules apply.
document.documentElement.classList.add(__THEME_TYPE__ === 'light' ? 'theme-light' : 'theme-dark')
createRoot(document.getElementById('root')).render(node)
`
}

/** esbuild-bundle the entry into a browser IIFE + its CSS, the same way the renderer build
 *  handles TSX + CSS. Theme vars are injected via `define` so the bundle stays self-contained. */
export async function bundleEntry({ repoRoot, entrySource, cssVars, type }) {
  const result = await esbuild.build({
    stdin: { contents: entrySource, resolveDir: repoRoot, loader: 'tsx' },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    write: false,
    // Virtual outdir (never written — write:false) so esbuild can emit the imported CSS as a
    // separate output file instead of erroring on "no output path configured".
    outdir: join(repoRoot, '.screenshot-bundle'),
    logLevel: 'warning',
    // A component with only a named export (no fixture, no default) makes `Mod.default`
    // statically undefined — expected, since we fall back to the named export. Silence just
    // that warning so real bundle problems still surface.
    logOverride: { 'import-is-undefined': 'silent' },
    // theme.css @font-face-loads the Seti icon font by relative URL. The captured page is served
    // from an opaque origin with no file server, so inline the font into the bundled CSS.
    loader: { '.woff': 'dataurl' },
    // Fonts theme.css @font-face's (Seti) become data URLs so the page stays self-contained.
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
    define: {
      'process.env.NODE_ENV': '"production"',
      __CSS_VARS__: JSON.stringify(cssVars),
      __THEME_TYPE__: JSON.stringify(type),
    },
  })
  const collect = (ext) => result.outputFiles.filter((f) => f.path.endsWith(ext)).map((f) => f.text).join('\n')
  return { js: collect('.js'), css: collect('.css') }
}

// ── Page assembly ──────────────────────────────────────────────────

/** Assemble a self-contained HTML page: a default electronAPI stub, the bundled CSS, a themed
 *  centered mount point, and the component bundle. No CSP, no Electron — just a themed page. */
export function renderHtml({ js, css }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; padding: 0; }
  #root {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 40px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: var(--type-ui);
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }
</style>
<style>${css}</style>
</head>
<body>
<script>
  // setContent serves the page from an opaque origin, where touching localStorage throws a
  // SecurityError. Components that persist UI state (sidebar section collapse, project
  // recency) read it during render, so without a shim they crash before mounting.
  try {
    window.localStorage.getItem('probe')
  } catch (e) {
    var memory = {}
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null },
        setItem: function (key, value) { memory[key] = String(value) },
        removeItem: function (key) { delete memory[key] },
        clear: function () { memory = {} },
      },
    })
  }

  // Default main-process bridge stub — every invoke resolves to [] so components that call
  // window.electronAPI on mount render their initial state without a live backend. Fixtures
  // override this before rendering when they need specific data.
  window.electronAPI = {
    invoke: function () { return Promise.resolve([]) },
    send: function () {},
    on: function () { return function () {} },
    getPathForFile: function () { return '' },
  };
</script>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`
}

// ── Browser launch ─────────────────────────────────────────────────

/** Launch a headless Chromium for the screenshot. Prefers an explicit binary
 *  (SCREENSHOT_CHROMIUM / CHROME_PATH), then Playwright's managed browser, then the system
 *  Google Chrome (the "Claude in Chrome" recipe most dev machines already have). */
async function launchChromium() {
  const { chromium } = await import('playwright-core')
  const args = ['--no-sandbox', '--force-color-profile=srgb', '--hide-scrollbars']
  const override = process.env.SCREENSHOT_CHROMIUM || process.env.CHROME_PATH
  if (override) {
    return chromium.launch({ headless: true, executablePath: override, args })
  }
  try {
    return await chromium.launch({ headless: true, args })
  } catch (managedError) {
    try {
      return await chromium.launch({ headless: true, channel: 'chrome', args })
    } catch {
      throw new Error(
        'Could not launch a Chromium for the screenshot.\n' +
          '  • Install Playwright\'s Chromium: npx playwright install chromium\n' +
          '  • or point at a browser: SCREENSHOT_CHROMIUM=/path/to/chrome npm run screenshot:component ...\n' +
          `Underlying error: ${managedError.message}`,
      )
    }
  }
}

// ── Orchestrator ───────────────────────────────────────────────────

export async function screenshotComponent(options) {
  const {
    repoRoot = DEFAULT_REPO_ROOT,
    component,
    theme = DEFAULT_THEME,
    out,
    width = 900,
    height = 700,
    fullPage = false,
    emitHtml = null,
    log = () => {},
  } = options

  if (!component) throw new Error('Usage: npm run screenshot:component <Component> [--theme <id>] [--out <path>]')

  const target = findTarget(component, { searchRoots: [join(repoRoot, 'src', 'renderer')] })
  log(`Rendering ${target.name} (${target.kind}: ${relative(repoRoot, target.file)}) under theme "${theme}"`)

  const { cssVars, type } = await loadThemeVars(repoRoot, theme)
  const entrySource = buildEntrySource(target, repoRoot)
  const { js, css } = await bundleEntry({ repoRoot, entrySource, cssVars, type })
  const html = renderHtml({ js, css })

  // --emit-html writes the self-contained page (open it in any browser) and skips the capture.
  if (emitHtml) {
    const htmlPath = typeof emitHtml === 'string' ? resolve(emitHtml) : resolve(repoRoot, 'screenshots', `${component}.${theme}.html`)
    mkdirSync(dirname(htmlPath), { recursive: true })
    writeFileSync(htmlPath, html)
    log(`Wrote HTML → ${htmlPath}`)
    return { htmlPath }
  }

  const outPath = out ? resolve(out) : resolve(repoRoot, 'screenshots', `${component}.${theme}.png`)
  mkdirSync(dirname(outPath), { recursive: true })

  const browser = await launchChromium()
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForFunction(() => document.getElementById('root')?.childElementCount > 0, null, { timeout: 10_000 })
    await page.waitForTimeout(250) // let fonts / entry animations settle
    await page.screenshot({ path: outPath, fullPage })
    log(`Wrote screenshot → ${outPath}`)
    return { outPath }
  } finally {
    await browser.close()
  }
}

// ── CLI ────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  screenshotComponent({ ...args, log: (m) => console.log(`[screenshot] ${m}`) })
    .then((r) => {
      if (!r.outPath && !r.htmlPath) return
      // Confirm the artifact exists — a green run must produce a file.
      const artifact = r.outPath ?? r.htmlPath
      if (!existsSync(artifact)) {
        console.error(`[screenshot] expected artifact missing: ${artifact}`)
        process.exit(1)
      }
    })
    .catch((err) => {
      console.error(`[screenshot] failed: ${err.message}`)
      process.exit(1)
    })
}
