// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTheme, DEFAULT_THEME } from '../../shared/themes/registry'

const THEME_CSS = resolve(dirname(fileURLToPath(import.meta.url)), 'theme.css')

/** The literal custom-property declarations in theme.css's `:root` fallback block.
 *  `var(...)`-valued declarations are derivations, not colors, so they are skipped. */
function readFallbacks(): Map<string, string> {
  const css = readFileSync(THEME_CSS, 'utf-8')
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')))
  const found = new Map<string, string>()
  for (const [, name, value] of root.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const trimmed = value.trim()
    if (!trimmed.includes('var(') && !trimmed.includes('color-mix(')) {
      found.set(name, trimmed.toLowerCase())
    }
  }
  return found
}

describe('theme.css :root fallbacks', () => {
  const fallbacks = readFallbacks()
  const themeVars = loadTheme(DEFAULT_THEME).cssVars

  it('reads a plausible number of colour declarations', () => {
    // Guards the parser itself: a regex that silently matched nothing would make
    // every assertion below vacuously pass.
    expect(fallbacks.size).toBeGreaterThan(20)
    expect(fallbacks.get('--bg-primary')).toBe('#06080f')
  })

  // These fallbacks are what paints between the window's first frame and App mounting,
  // so any drift from the default theme shows up as a flash of the wrong palette.
  //
  // Shadows are excluded: theme.css layers an extra `inset 0 1px 0 rgba(255,255,255,…)`
  // top highlight onto each one that the adapter does not emit. That is a stylesheet
  // design choice rather than palette drift, so pinning it here would force the richer
  // shadow to be dropped. Colours are the part that must not diverge.
  it('match the default theme for every colour both define', () => {
    const shared = [...fallbacks.keys()].filter((name) => name in themeVars && !name.startsWith('--shadow-'))
    expect(shared.length).toBeGreaterThan(15)

    const drifted = shared
      .filter((name) => themeVars[name].toLowerCase() !== fallbacks.get(name))
      .map((name) => `${name}: theme.css has ${fallbacks.get(name)}, ${DEFAULT_THEME} has ${themeVars[name]}`)

    expect(drifted).toEqual([])
  })
})
