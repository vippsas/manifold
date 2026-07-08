import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

if (betterSqlite3Loads()) {
  process.exit(0)
}

const nodeRoot = path.dirname(path.dirname(process.execPath))
const npmBinary = process.platform === 'win32' ? 'npm.cmd' : 'npm'

execFileSync(npmBinary, ['rebuild', 'better-sqlite3'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    npm_config_build_from_source: 'true',
    npm_config_cache: '/tmp/manifold-npm-cache',
    npm_config_nodedir: nodeRoot,
  },
})

if (!betterSqlite3Loads()) {
  throw new Error('better-sqlite3 is still not loadable after rebuilding for the current Node runtime.')
}

// Probe whether better-sqlite3 loads under the current Node ABI *in a fresh process*.
// Both callers (the pre-rebuild early-exit at the top and the post-rebuild re-check) must
// stay out of this long-lived process: once a process has tried and failed to dlopen the
// wrong-ABI binary at this path, Node cannot re-dlopen the rebuilt addon in that same
// process — the retry throws "Module did not self-register" even though the freshly-built
// binary loads cleanly in a new process. Running each probe in its own subprocess sidesteps
// that entirely: every load happens in a clean process that sees the correct binary.
function betterSqlite3Loads() {
  const probe = "const D = require('better-sqlite3'); new D(':memory:').close()"
  const result = spawnSync(process.execPath, ['-e', probe], { cwd: REPO_ROOT, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status === 0) return true
  const message = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (
    message.includes('NODE_MODULE_VERSION')
    || message.includes('Could not locate the bindings file')
    || message.includes('better_sqlite3.node')
  ) {
    return false
  }
  throw new Error(
    `better-sqlite3 failed to load for an unexpected reason (exit ${result.status}, signal ${result.signal}):\n${message.trim()}`,
  )
}
