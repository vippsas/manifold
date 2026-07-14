import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function requireFile(root, relativePath, label, mode = constants.F_OK) {
  try {
    await access(resolve(root, relativePath), mode)
  } catch {
    throw new Error(`Missing ${label}: ${relativePath}`)
  }
}

export async function verifyLinuxPackage(root) {
  await requireFile(root, 'manifold', 'executable', constants.X_OK)
  await requireFile(
    root,
    'resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node',
    'node-pty native module',
  )
  await requireFile(
    root,
    'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'better-sqlite3 native module',
  )

  await requireFile(
    root,
    'resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node',
    'canvas Linux x64 GNU native module',
  )
}

export function verifyLinuxNativeModules(root, run = spawnSync) {
  const executable = resolve(root, 'manifold')
  const helper = resolve(process.cwd(), 'scripts/verify-linux-native-modules.cjs')
  const result = run(executable, [helper, root], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`
    throw new Error(`Electron could not load packaged native modules: ${detail}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] ?? 'dist/linux-unpacked')
  try {
    await verifyLinuxPackage(root)
    verifyLinuxNativeModules(root)
    console.log(`[verify-linux-package] verified ${root}`)
  } catch (error) {
    console.error(`[verify-linux-package] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
