// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  checkBetterSqlite3Abi,
  checkBuildOutput,
  checkDependencies,
  checkElectron,
  classifyAbiError,
} from './doctor.mjs'

let repoRoot: string

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'mf-doctor-'))
})

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true })
})

function makeFile(...segments: string[]): string {
  const full = join(repoRoot, ...segments)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, '')
  return full
}

const KEY_PACKAGES = ['electron', 'better-sqlite3', 'node-pty', 'electron-vite', 'vitest']

function installKeyPackages(): void {
  for (const pkg of KEY_PACKAGES) {
    mkdirSync(join(repoRoot, 'node_modules', pkg), { recursive: true })
  }
}

describe('checkDependencies', () => {
  it('fails when node_modules is missing', () => {
    expect(checkDependencies(repoRoot).status).toBe('fail')
  })

  it('fails when a key package is missing', () => {
    mkdirSync(join(repoRoot, 'node_modules', 'electron'), { recursive: true })
    const result = checkDependencies(repoRoot)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('better-sqlite3')
  })

  it('passes when all key packages are present', () => {
    installKeyPackages()
    expect(checkDependencies(repoRoot).status).toBe('ok')
  })

  it('warns when node_modules is a symlink', () => {
    const real = mkdtempSync(join(tmpdir(), 'mf-doctor-real-'))
    for (const pkg of KEY_PACKAGES) mkdirSync(join(real, pkg), { recursive: true })
    symlinkSync(real, join(repoRoot, 'node_modules'))

    const result = checkDependencies(repoRoot)
    expect(result.status).toBe('warn')
    expect(result.message).toContain('symlink')

    rmSync(real, { recursive: true, force: true })
  })
})

describe('checkElectron', () => {
  it('fails when the electron package is absent', () => {
    installKeyPackages()
    rmSync(join(repoRoot, 'node_modules', 'electron'), { recursive: true, force: true })
    expect(checkElectron(repoRoot).status).toBe('fail')
  })

  it('fails when path.txt is missing (the broken-symlink signature)', () => {
    mkdirSync(join(repoRoot, 'node_modules', 'electron'), { recursive: true })
    const result = checkElectron(repoRoot)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('path.txt')
  })

  it('fails when path.txt points at a binary that was not downloaded', () => {
    makeFile('node_modules', 'electron', 'path.txt')
    writeFileSync(join(repoRoot, 'node_modules', 'electron', 'path.txt'), 'electron')
    const result = checkElectron(repoRoot)
    expect(result.status).toBe('fail')
    expect(result.message).toContain('not downloaded')
  })

  it('passes when path.txt and the binary both exist', () => {
    const electron = join(repoRoot, 'node_modules', 'electron')
    mkdirSync(join(electron, 'dist'), { recursive: true })
    writeFileSync(join(electron, 'path.txt'), 'electron\n')
    writeFileSync(join(electron, 'dist', 'electron'), '')
    writeFileSync(join(electron, 'package.json'), JSON.stringify({ version: '39.8.8' }))

    const result = checkElectron(repoRoot)
    expect(result.status).toBe('ok')
    expect(result.message).toContain('v39.8.8')
  })
})

describe('classifyAbiError', () => {
  it('reads the ABI a mismatched binary was built for', () => {
    const message =
      "The module '.../better_sqlite3.node' was compiled against a different Node.js version "
      + 'using NODE_MODULE_VERSION 140. This version of Node.js requires NODE_MODULE_VERSION 127.'
    expect(classifyAbiError(message)).toEqual({ kind: 'mismatch', builtFor: 140 })
  })

  it('detects a missing native binary', () => {
    expect(classifyAbiError('Could not locate the bindings file').kind).toBe('unbuilt')
  })

  it('falls back to unknown for unrelated errors', () => {
    expect(classifyAbiError('some other failure').kind).toBe('unknown')
  })
})

describe('checkBetterSqlite3Abi', () => {
  it('fails when better-sqlite3 is not installed', () => {
    expect(checkBetterSqlite3Abi(repoRoot).status).toBe('fail')
  })
})

describe('checkBuildOutput', () => {
  it('reports info when out/ has not been built', () => {
    makeFile('src', 'main', 'index.ts')
    expect(checkBuildOutput(repoRoot).status).toBe('info')
  })

  it('warns when source is newer than out/', () => {
    const src = makeFile('src', 'main', 'index.ts')
    const out = makeFile('out', 'main', 'index.js')
    utimesSync(out, new Date(1000), new Date(1000))
    utimesSync(src, new Date(2000), new Date(2000))
    expect(checkBuildOutput(repoRoot).status).toBe('warn')
  })

  it('passes when out/ is newer than source', () => {
    const src = makeFile('src', 'main', 'index.ts')
    const out = makeFile('out', 'main', 'index.js')
    utimesSync(src, new Date(1000), new Date(1000))
    utimesSync(out, new Date(2000), new Date(2000))
    expect(checkBuildOutput(repoRoot).status).toBe('ok')
  })
})
