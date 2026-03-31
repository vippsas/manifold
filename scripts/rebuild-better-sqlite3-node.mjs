import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

if (canLoadBetterSqlite3()) {
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

if (!canLoadBetterSqlite3()) {
  throw new Error('better-sqlite3 is still not loadable after rebuilding for the current Node runtime.')
}

function canLoadBetterSqlite3() {
  try {
    const Database = require('better-sqlite3')
    const db = new Database(':memory:')
    db.close()
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('NODE_MODULE_VERSION')
      || message.includes('Could not locate the bindings file')
      || message.includes('better_sqlite3.node')
    ) {
      return false
    }
    throw error
  }
}
