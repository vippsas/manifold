// scripts/doctor.mjs — `npm run doctor`: report whether a worktree is ready to run.
// Checks the four things that leave a fresh/symlinked worktree broken: deps installed,
// the Electron binary actually downloaded, which ABI `better-sqlite3` is built for, and
// whether `out/` is stale. Prints a status line per check and exits non-zero on a hard
// failure (missing deps or Electron binary) so it can gate scripts and CI.
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(HERE, '..')

// Top-level packages whose absence means the install never completed.
const KEY_PACKAGES = ['electron', 'better-sqlite3', 'node-pty', 'electron-vite', 'vitest']

const SYMBOLS = { ok: '✓', warn: '⚠', fail: '✗', info: '•' }

export function checkDependencies(repoRoot) {
  const nodeModules = join(repoRoot, 'node_modules')
  if (!existsSync(nodeModules)) {
    return { status: 'fail', title: 'Dependencies', message: 'node_modules is missing', fix: 'npm run bootstrap' }
  }

  const missing = KEY_PACKAGES.filter((pkg) => !existsSync(join(nodeModules, pkg)))
  if (missing.length > 0) {
    return {
      status: 'fail',
      title: 'Dependencies',
      message: `install incomplete — missing ${missing.join(', ')}`,
      fix: 'npm run bootstrap',
    }
  }

  if (lstatSync(nodeModules).isSymbolicLink()) {
    return {
      status: 'warn',
      title: 'Dependencies',
      message: 'node_modules is a symlink — the supported setup is a real install (CLAUDE.md §7)',
      fix: 'rm node_modules && npm run bootstrap',
    }
  }

  return { status: 'ok', title: 'Dependencies', message: `node_modules present (${KEY_PACKAGES.join(', ')})` }
}

// Electron's launcher reads node_modules/electron/path.txt and joins it under dist/ to find
// the binary. A symlinked or half-installed tree leaves path.txt (or the binary) missing,
// which surfaces at runtime as `Error: Electron uninstall`.
export function checkElectron(repoRoot) {
  const electronDir = join(repoRoot, 'node_modules', 'electron')
  if (!existsSync(electronDir)) {
    return { status: 'fail', title: 'Electron binary', message: 'electron package not installed', fix: 'npm run bootstrap' }
  }

  const pathTxt = join(electronDir, 'path.txt')
  if (!existsSync(pathTxt)) {
    return {
      status: 'fail',
      title: 'Electron binary',
      message: 'node_modules/electron/path.txt missing — install is incomplete (causes "Error: Electron uninstall")',
      fix: 'npm run bootstrap',
    }
  }

  const binary = join(electronDir, 'dist', readFileSync(pathTxt, 'utf8').trim())
  if (!existsSync(binary)) {
    return {
      status: 'fail',
      title: 'Electron binary',
      message: 'Electron binary not downloaded (dist/ empty)',
      fix: 'npm run bootstrap',
    }
  }

  return { status: 'ok', title: 'Electron binary', message: `${electronVersion(electronDir)} present` }
}

function electronVersion(electronDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(electronDir, 'package.json'), 'utf8'))
    return `v${manifest.version}`
  } catch {
    return 'installed'
  }
}

// Given a NODE_MODULE_VERSION mismatch error, figure out which ABI the binary was built for.
// The message reads: "...compiled against a different Node.js version using NODE_MODULE_VERSION
// <builtFor>. This version of Node.js requires NODE_MODULE_VERSION <current>."
export function classifyAbiError(message) {
  const versions = [...message.matchAll(/NODE_MODULE_VERSION (\d+)/g)].map((m) => Number(m[1]))
  if (message.includes('NODE_MODULE_VERSION')) {
    return { kind: 'mismatch', builtFor: versions[0] ?? null }
  }
  if (message.includes('Could not locate the bindings file') || message.includes('better_sqlite3.node')) {
    return { kind: 'unbuilt', builtFor: null }
  }
  return { kind: 'unknown', builtFor: null }
}

export function checkBetterSqlite3Abi(repoRoot, currentModules = process.versions.modules) {
  const pkgDir = join(repoRoot, 'node_modules', 'better-sqlite3')
  if (!existsSync(pkgDir)) {
    return { status: 'fail', title: 'better-sqlite3 ABI', message: 'not installed', fix: 'npm run bootstrap' }
  }

  const require = createRequire(join(repoRoot, 'noop.js'))
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return {
      status: 'ok',
      title: 'better-sqlite3 ABI',
      message: `built for this Node ABI (NODE_MODULE_VERSION ${currentModules}) — ready for \`npm test\``,
      fix: 'to run the app, `npm run dev`/`start` rebuilds it for Electron (or `npm run rebuild:electron`)',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const { kind, builtFor } = classifyAbiError(message)
    if (kind === 'mismatch') {
      return {
        status: 'info',
        title: 'better-sqlite3 ABI',
        message: `built for a different ABI (NODE_MODULE_VERSION ${builtFor ?? '?'}, not this Node's ${currentModules}) — likely Electron`,
        fix: '`npm test` rebuilds for Node; `npm run dev` uses it as-is',
      }
    }
    if (kind === 'unbuilt') {
      return { status: 'fail', title: 'better-sqlite3 ABI', message: 'native binary not built', fix: 'npm run bootstrap' }
    }
    return { status: 'warn', title: 'better-sqlite3 ABI', message: `could not load: ${message.split('\n')[0]}` }
  }
}

// Recursively find the newest mtime under `dir` (0 if it doesn't exist).
function newestMtimeMs(dir) {
  let newest = 0
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else {
        try {
          const mtime = statSync(full).mtimeMs
          if (mtime > newest) newest = mtime
        } catch {
          // Skip entries we can't stat (e.g. a dangling symlink in a broken tree).
        }
      }
    }
  }
  return newest
}

export function checkBuildOutput(repoRoot) {
  const outDir = join(repoRoot, 'out')
  if (!existsSync(outDir)) {
    return { status: 'info', title: 'Build output', message: 'out/ not built yet', fix: '`npm run dev` / `npm run build`' }
  }

  const srcNewest = newestMtimeMs(join(repoRoot, 'src'))
  const outNewest = newestMtimeMs(outDir)
  if (srcNewest > outNewest) {
    return {
      status: 'warn',
      title: 'Build output',
      message: 'out/ is stale — source changed since the last build',
      fix: '`npm run dev` / `npm run build` will rebuild',
    }
  }

  return { status: 'ok', title: 'Build output', message: 'out/ is up to date' }
}

// Read `git config --get rerere.enabled` for the repo at `repoRoot`, returning the trimmed
// value or null when git is unavailable or the key is unset (a fresh worktree that never ran
// bootstrap). Isolated so tests can inject a fake reader instead of shelling out to git.
function readGitRerereEnabled(repoRoot) {
  try {
    return execFileSync('git', ['config', '--get', 'rerere.enabled'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

// git rerere records how a merge/rebase conflict was resolved and replays that resolution the
// next time the same conflict recurs. `setup-worktree.sh` enables it on `npm run bootstrap`, so
// a worktree where it is off predates that setup or skipped bootstrap (issue #835).
export function checkGitRerere(repoRoot, readEnabled = readGitRerereEnabled) {
  if (readEnabled(repoRoot) === 'true') {
    return {
      status: 'ok',
      title: 'git rerere',
      message: 'enabled — recurring merge/rebase conflict resolutions replay automatically',
    }
  }
  return {
    status: 'warn',
    title: 'git rerere',
    message: 'not enabled — repeated conflict resolutions must be redone by hand',
    fix: 'npm run bootstrap',
  }
}

export function runDoctor(repoRoot = DEFAULT_REPO_ROOT) {
  return [
    checkDependencies(repoRoot),
    checkElectron(repoRoot),
    checkBetterSqlite3Abi(repoRoot),
    checkBuildOutput(repoRoot),
    checkGitRerere(repoRoot),
  ]
}

function formatResult(result) {
  const symbol = SYMBOLS[result.status] ?? '?'
  const title = result.title.padEnd(18)
  const fix = result.fix ? `\n                     → ${result.fix}` : ''
  return `${symbol} ${title} ${result.message}${fix}`
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = runDoctor()
  console.log('Manifold environment doctor\n')
  for (const result of results) {
    console.log(formatResult(result))
  }
  const failed = results.filter((r) => r.status === 'fail')
  console.log('')
  if (failed.length > 0) {
    console.log(`Environment not ready — ${failed.length} problem(s). Run \`npm run bootstrap\`.`)
    process.exit(1)
  }
  console.log('Environment healthy.')
}
