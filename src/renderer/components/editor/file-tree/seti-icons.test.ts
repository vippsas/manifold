import { describe, it, expect } from 'vitest'
import { getSetiFileIcon } from './seti-icons'
import { ICON_DEFINITIONS } from './seti-icon-data'

/** The icon id a name resolves to, recovered by matching the returned glyph + colour. */
function iconIdOf(fileName: string): string {
  const icon = getSetiFileIcon(fileName)
  const match = Object.entries(ICON_DEFINITIONS).find(
    ([, [character, dark]]) => character === icon.character && dark === icon.color,
  )
  return match?.[0] ?? 'UNKNOWN'
}

describe('getSetiFileIcon', () => {
  it.each([
    ['tsconfig.json', '_tsconfig'],
    ['yarn.lock', '_yarn'],
    ['vite.config.ts', '_vite'],
    ['README.md', '_info'],
  ])('resolves %s by exact file name', (fileName, iconId) => {
    expect(iconIdOf(fileName)).toBe(iconId)
  })

  it.each([
    ['image.png', '_image'],
    ['App.vue', '_vue'],
    ['notebook.ipynb', '_notebook'],
  ])('resolves %s by extension', (fileName, iconId) => {
    expect(iconIdOf(fileName)).toBe(iconId)
  })

  it.each([
    ['index.ts', '_typescript'],
    ['main.py', '_python'],
    ['server.go', '_go2'],
    ['Main.java', '_java'],
    ['script.sh', '_shell'],
  ])('resolves %s by detected language, which Seti maps instead of the raw extension', (fileName, iconId) => {
    expect(iconIdOf(fileName)).toBe(iconId)
  })

  it.each([
    ['Dockerfile', '_docker'],
    ['Makefile', '_makefile'],
  ])('resolves %s by a language-registered file name', (fileName, iconId) => {
    expect(iconIdOf(fileName)).toBe(iconId)
  })

  it.each([
    ['docker-compose.yml', '_docker_3'],
    ['.env.local', '_config'],
  ])('resolves %s by a language-registered file name pattern', (fileName, iconId) => {
    expect(iconIdOf(fileName)).toBe(iconId)
  })

  it('prefers the exact file name over the extension', () => {
    // `tsconfig.json` is a file name entry; `.json` would otherwise give the plain JSON icon.
    expect(iconIdOf('tsconfig.json')).not.toBe(iconIdOf('settings.json'))
  })

  it('prefers the longest matching extension', () => {
    // `spec.ts` has its own (orange) icon; `.ts` alone is the blue TypeScript one.
    expect(iconIdOf('component.spec.ts')).toBe('_typescript_1')
    expect(iconIdOf('component.ts')).toBe('_typescript')
  })

  it('prefers an extension entry over the detected language', () => {
    // Seti maps the `.h` extension to its own icon even though C claims the language.
    expect(iconIdOf('vector.h')).toBe('_c_1')
    expect(iconIdOf('vector.c')).toBe('_c')
  })

  it('matches file names case-insensitively', () => {
    expect(iconIdOf('LICENSE')).toBe('_license')
    expect(iconIdOf('license')).toBe('_license')
    expect(iconIdOf('Makefile')).toBe(iconIdOf('makefile'))
  })

  it('falls back to the default icon for unknown names', () => {
    expect(iconIdOf('mystery.qqq')).toBe('_default')
    expect(iconIdOf('notes.txt')).toBe('_default')
    expect(iconIdOf('')).toBe('_default')
  })

  it('returns a light-theme colour that differs from the dark one', () => {
    const icon = getSetiFileIcon('index.ts')
    expect(icon.color).toBe('#519aba')
    expect(icon.lightColor).toBe('#498ba7')
  })

  it('returns a single glyph from the Seti private-use range', () => {
    const { character } = getSetiFileIcon('index.ts')
    expect(character).toHaveLength(1)
    expect(character.codePointAt(0)).toBeGreaterThanOrEqual(0xe000)
    expect(character.codePointAt(0)).toBeLessThanOrEqual(0xf8ff)
  })
})
