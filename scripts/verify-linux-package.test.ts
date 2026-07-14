import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyLinuxNativeModules, verifyLinuxPackage } from './verify-linux-package.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function completePackage(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'manifold-linux-package-'))
  roots.push(root)
  const files = [
    'manifold',
    'resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node',
    'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node',
  ]
  for (const relativePath of files) {
    const filePath = join(root, relativePath)
    await mkdir(join(filePath, '..'), { recursive: true })
    await writeFile(filePath, '')
  }
  await chmod(join(root, 'manifold'), 0o755)
  return root
}

describe('verifyLinuxPackage', () => {
  it('accepts a complete unpacked Linux package', async () => {
    const root = await completePackage()
    await expect(verifyLinuxPackage(root)).resolves.toBeUndefined()
  })

  it.each([
    ['manifold', 'executable'],
    ['resources/app.asar.unpacked/node_modules/node-pty/build/Release/pty.node', 'node-pty'],
    ['resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'better-sqlite3'],
    ['resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu/skia.linux-x64-gnu.node', 'canvas'],
  ])('rejects a package missing %s', async (relativePath, expectedMessage) => {
    const root = await completePackage()
    await rm(join(root, relativePath))
    await expect(verifyLinuxPackage(root)).rejects.toThrow(expectedMessage)
  })

  it('rejects a musl-only canvas package for the WSL glibc target', async () => {
    const root = await completePackage()
    const gnu = join(root, 'resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-gnu')
    const musl = join(root, 'resources/app.asar.unpacked/node_modules/@napi-rs/canvas-linux-x64-musl')
    await rm(gnu, { recursive: true })
    await mkdir(musl, { recursive: true })
    await writeFile(join(musl, 'skia.linux-x64-musl.node'), '')

    await expect(verifyLinuxPackage(root)).rejects.toThrow('canvas Linux x64 GNU')
  })
})

describe('verifyLinuxNativeModules', () => {
  it('runs the packaged executable as Node to load native modules', () => {
    const run = vi.fn(() => ({ status: 0, stderr: '' }))

    expect(() => verifyLinuxNativeModules('/tmp/linux-unpacked', run as never)).not.toThrow()
    expect(run).toHaveBeenCalledWith(
      '/tmp/linux-unpacked/manifold',
      [expect.stringContaining('verify-linux-native-modules.cjs'), '/tmp/linux-unpacked'],
      expect.objectContaining({ env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1' }) }),
    )
  })

  it('rejects native modules that Electron cannot load', () => {
    const run = vi.fn(() => ({ status: 1, stderr: 'NODE_MODULE_VERSION mismatch' }))

    expect(() => verifyLinuxNativeModules('/tmp/linux-unpacked', run as never))
      .toThrow('Electron could not load packaged native modules: NODE_MODULE_VERSION mismatch')
  })
})
