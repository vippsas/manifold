// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveBuiltMain, resolveElectronBinary, driverEnv } from './drive-app.mjs'

describe('driverEnv', () => {
  it('strips ELECTRON_RENDERER_URL so the built renderer loads (window-factory.ts)', () => {
    const env = driverEnv({ PATH: '/usr/bin', ELECTRON_RENDERER_URL: 'http://localhost:5173' })
    expect(env.ELECTRON_RENDERER_URL).toBeUndefined()
    expect(env.PATH).toBe('/usr/bin')
  })
  it('does not mutate the input env', () => {
    const input = { ELECTRON_RENDERER_URL: 'x' }
    driverEnv(input)
    expect(input.ELECTRON_RENDERER_URL).toBe('x')
  })
})

describe('resolveBuiltMain', () => {
  let root: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mf-drive-'))
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('throws with the build fix when out/main/index.js is missing', () => {
    expect(() => resolveBuiltMain(root)).toThrow(/npm run build/)
  })
  it('returns the path once the app is built', () => {
    mkdirSync(join(root, 'out', 'main'), { recursive: true })
    writeFileSync(join(root, 'out', 'main', 'index.js'), '// built')
    expect(resolveBuiltMain(root)).toBe(join(root, 'out', 'main', 'index.js'))
  })
})

describe('resolveElectronBinary', () => {
  let root: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mf-electron-'))
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('throws when path.txt is missing (incomplete install)', () => {
    expect(() => resolveElectronBinary(root)).toThrow(/bootstrap/)
  })
  it('reads path.txt and joins it under dist/ like Electron does', () => {
    const electronDir = join(root, 'node_modules', 'electron')
    mkdirSync(join(electronDir, 'dist'), { recursive: true })
    writeFileSync(join(electronDir, 'path.txt'), 'electron\n')
    writeFileSync(join(electronDir, 'dist', 'electron'), '#!/bin/sh\n')
    expect(resolveElectronBinary(root)).toBe(join(electronDir, 'dist', 'electron'))
  })
})
