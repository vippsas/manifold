// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlugins } from './build-plugins.mjs'

let root: string
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mf-buildplugins-'))
  const a = join(root, 'alpha')
  mkdirSync(join(a, 'src'), { recursive: true })
  writeFileSync(join(a, 'package.json'), JSON.stringify({ name: 'alpha', publisher: 'm', version: '1.0.0', engines: { manifold: '^0.3.0' }, main: './out/plugin.js' }))
  writeFileSync(join(a, 'src', 'plugin.ts'), `const manifold = require('manifold'); export function activate(){ manifold.commands.registerCommand('a.x', () => 1) }`)
  mkdirSync(join(a, 'src', 'webview'), { recursive: true })
  writeFileSync(join(a, 'src', 'webview', 'index.tsx'), `document.title = 'mf-webview-ok'`)
  const b = join(root, 'beta')
  mkdirSync(join(b, 'out'), { recursive: true })
  writeFileSync(join(b, 'package.json'), JSON.stringify({ name: 'beta', publisher: 'm', version: '1.0.0', engines: { vscode: '^1.104.0' }, main: './out/extension.js' }))
  writeFileSync(join(b, 'out', 'extension.js'), 'module.exports={activate(){}}\n')
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('buildPlugins', () => {
  it('compiles plugins that have a src/ dir to their manifest main path', async () => {
    const built = await buildPlugins(root)
    expect(built).toContain('alpha')
    const out = join(root, 'alpha', 'out', 'plugin.js')
    expect(existsSync(out)).toBe(true)
    const code = readFileSync(out, 'utf8')
    expect(code).toContain('a.x')
    expect(code).toContain('require("manifold")')
  })

  it('also bundles a webview entry to out/webview.js when present', async () => {
    await buildPlugins(root)
    const out = join(root, 'alpha', 'out', 'webview.js')
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf8')).toContain('mf-webview-ok')
  })

  it('skips plugins without a src/ dir (prebuilt) and leaves their out untouched', async () => {
    const built = await buildPlugins(root)
    expect(built).not.toContain('beta')
    expect(readFileSync(join(root, 'beta', 'out', 'extension.js'), 'utf8')).toBe('module.exports={activate(){}}\n')
  })
})
