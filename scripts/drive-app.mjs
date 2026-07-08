// scripts/drive-app.mjs — `npm run drive:app`: launch the *built* Electron app under
// playwright-core and assert on a rendered surface, for flow-level UI checks agents can run
// themselves. See docs/architecture/renderer-verification.md.
//
// It drives `out/main/index.js` (requires a prior `npm run build`) and strips
// ELECTRON_RENDERER_URL so the app loads the built renderer instead of a dev server — see
// loadRenderer() in src/main/app/window-factory.ts. Import `launchBuiltApp` from this module to
// write your own assertions, or run it directly for a default smoke check + screenshot.
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(HERE, '..')

/** Path to the built main entry. Throws with the fix if the app hasn't been built. */
export function resolveBuiltMain(repoRoot) {
  const main = join(repoRoot, 'out', 'main', 'index.js')
  if (!existsSync(main)) {
    throw new Error(`Built app not found at ${main}. Build it first: npm run build`)
  }
  return main
}

/** Resolve the downloaded Electron binary the same way Electron's own launcher does:
 *  node_modules/electron/path.txt names the binary under dist/. */
export function resolveElectronBinary(repoRoot) {
  const electronDir = join(repoRoot, 'node_modules', 'electron')
  const pathTxt = join(electronDir, 'path.txt')
  if (!existsSync(pathTxt)) {
    throw new Error('node_modules/electron/path.txt missing — install is incomplete. Run: npm run bootstrap')
  }
  const binary = join(electronDir, 'dist', readFileSync(pathTxt, 'utf8').trim())
  if (!existsSync(binary)) {
    throw new Error('Electron binary not downloaded (dist/ empty). Run: npm run bootstrap')
  }
  return binary
}

/** A copy of `env` with ELECTRON_RENDERER_URL removed, forcing the built renderer to load via
 *  the production path (window-factory.ts) instead of an electron-vite dev server. */
export function driverEnv(env = process.env) {
  const copy = { ...env }
  delete copy.ELECTRON_RENDERER_URL
  return copy
}

/** Launch the built app and return the Playwright ElectronApplication + its first window. */
export async function launchBuiltApp({ repoRoot = DEFAULT_REPO_ROOT, extraArgs = [], timeout = 30_000 } = {}) {
  const { _electron } = await import('playwright-core')
  const mainPath = resolveBuiltMain(repoRoot)
  const executablePath = resolveElectronBinary(repoRoot)
  const app = await _electron.launch({
    executablePath,
    args: [mainPath, ...extraArgs],
    cwd: repoRoot,
    env: driverEnv(),
    timeout,
  })
  const window = await app.firstWindow({ timeout })
  return { app, window }
}

/** Launch, hand the first window to `assert(page)`, then close. Without an assert it runs a
 *  default smoke check: wait for the renderer root to mount and capture a screenshot. */
export async function driveApp({ repoRoot = DEFAULT_REPO_ROOT, assert, screenshotPath, log = () => {} } = {}) {
  const { app, window } = await launchBuiltApp({ repoRoot })
  try {
    log(`Built app launched — first window title: "${await window.title()}"`)
    if (assert) {
      await assert(window)
    } else {
      await window.waitForSelector('#root', { timeout: 15_000 })
      await window.waitForFunction(() => document.getElementById('root')?.childElementCount > 0, null, { timeout: 15_000 })
      const shot = screenshotPath ?? join(repoRoot, 'screenshots', 'built-app.png')
      mkdirSync(dirname(shot), { recursive: true })
      await window.screenshot({ path: shot })
      log(`Renderer surface mounted; screenshot → ${shot}`)
    }
  } finally {
    await app.close()
  }
}

// ── CLI ────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  driveApp({ log: (m) => console.log(`[drive-app] ${m}`) })
    .then(() => console.log('[drive-app] ok'))
    .catch((err) => {
      console.error(`[drive-app] failed: ${err.message}`)
      process.exit(1)
    })
}
