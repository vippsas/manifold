// @vitest-environment node
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseArgs,
  findTarget,
  buildEntrySource,
  renderHtml,
  loadThemeVars,
  bundleEntry,
} from './screenshot-component.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('parseArgs', () => {
  it('reads the component positional and defaults the theme', () => {
    expect(parseArgs(['NewAgentForm'])).toMatchObject({ component: 'NewAgentForm', theme: 'manifold-dark' })
  })
  it('parses --theme, --out, --width/--height, --full and --emit-html', () => {
    const a = parseArgs(['Foo', '--theme', 'jade-dark', '--out', 'x.png', '--width', '500', '--height', '400', '--full'])
    expect(a).toMatchObject({ component: 'Foo', theme: 'jade-dark', out: 'x.png', width: 500, height: 400, fullPage: true })
    expect(parseArgs(['Foo', '--emit-html', 'x.html']).emitHtml).toBe('x.html')
    expect(parseArgs(['Foo', '--emit-html']).emitHtml).toBe(true)
    // --emit-html's path is optional; a following flag must not be swallowed as the path.
    const a2 = parseArgs(['Foo', '--emit-html', '--theme', 'jade-dark'])
    expect(a2.emitHtml).toBe(true)
    expect(a2.theme).toBe('jade-dark')
  })
})

describe('findTarget', () => {
  let root: string
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mf-shot-'))
    mkdirSync(join(root, 'a'), { recursive: true })
    mkdirSync(join(root, 'b'), { recursive: true })
    writeFileSync(join(root, 'a', 'Foo.fixture.tsx'), 'export default null')
    writeFileSync(join(root, 'b', 'Foo.tsx'), 'export const Foo = () => null')
    writeFileSync(join(root, 'b', 'Bare.tsx'), 'export const Bare = () => null')
  })
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('prefers a .fixture.tsx over the raw component', () => {
    const t = findTarget('Foo', { searchRoots: [root] })
    expect(t.kind).toBe('fixture')
    expect(t.file.endsWith('Foo.fixture.tsx')).toBe(true)
  })
  it('falls back to the component when there is no fixture', () => {
    const t = findTarget('Bare', { searchRoots: [root] })
    expect(t.kind).toBe('component')
    expect(t.file.endsWith('Bare.tsx')).toBe(true)
  })
  it('throws a helpful error when neither exists', () => {
    expect(() => findTarget('Missing', { searchRoots: [root] })).toThrow(/No "Missing\.fixture\.tsx"/)
  })
})

describe('buildEntrySource', () => {
  it('imports a fixture as a default export and handles element-or-component', () => {
    const src = buildEntrySource({ kind: 'fixture', file: join(REPO_ROOT, 'x', 'Foo.fixture.tsx'), name: 'Foo' }, REPO_ROOT)
    expect(src).toContain('import Target from "./x/Foo.fixture.tsx"')
    expect(src).toContain('React.isValidElement(Target)')
    expect(src).toContain("import { applyThemeCssVars } from './src/shared/themes/adapter'")
  })
  it('imports a bare component as a namespace and picks the named/default export', () => {
    const src = buildEntrySource({ kind: 'component', file: join(REPO_ROOT, 'x', 'Bar.tsx'), name: 'Bar' }, REPO_ROOT)
    expect(src).toContain('import * as Mod from "./x/Bar.tsx"')
    expect(src).toContain('Mod.default ?? Mod["Bar"]')
  })
})

describe('renderHtml', () => {
  it('assembles a self-contained page with the electronAPI stub, css, js and mount point', () => {
    const html = renderHtml({ js: 'JS_MARKER', css: 'CSS_MARKER' })
    expect(html).toContain('window.electronAPI')
    expect(html).toContain('id="root"')
    expect(html).toContain('JS_MARKER')
    expect(html).toContain('CSS_MARKER')
    expect(html).toContain('background: var(--bg-primary)')
  })
})

describe('loadThemeVars (real theme conversion)', () => {
  it('resolves a known theme to CSS variables + type', async () => {
    const { cssVars, type, id } = await loadThemeVars(REPO_ROOT, 'manifold-dark')
    expect(id).toBe('manifold-dark')
    expect(type).toBe('dark')
    expect(cssVars['--bg-primary']).toMatch(/^#/)
    expect(cssVars['--accent']).toBeTruthy()
  })
  it('rejects an unknown theme with the available list', async () => {
    await expect(loadThemeVars(REPO_ROOT, 'no-such-theme')).rejects.toThrow(/Unknown theme.*Available themes/s)
  })
})

describe('bundleEntry (real esbuild + real component)', () => {
  it('bundles the NewAgentForm fixture into a browser IIFE with inlined theme vars and CSS', async () => {
    const target = findTarget('NewAgentForm', { searchRoots: [join(REPO_ROOT, 'src', 'renderer')] })
    const { cssVars, type } = await loadThemeVars(REPO_ROOT, 'manifold-dark')
    const entrySource = buildEntrySource(target, REPO_ROOT)
    const { js, css } = await bundleEntry({ repoRoot: REPO_ROOT, entrySource, cssVars, type })
    expect(js.length).toBeGreaterThan(1000)
    // The theme's background color is inlined via `define` and the app's CSS tokens are bundled.
    expect(js).toContain(cssVars['--bg-primary'])
    expect(css).toContain('--radius-md')
  }, 30_000)
})
