import { getThemeList, loadTheme, migrateLegacyTheme, getThemeFamilies, themeFamilyOf } from './registry'
import { DEFAULT_SETTINGS } from '../defaults'

describe('first-run default theme', () => {
  it('is Manifold Dark', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('manifold-dark')
  })

  // loadTheme() silently falls back to manifold-dark for an unknown id, so a typo in
  // DEFAULT_SETTINGS.theme would ship a different theme without failing anywhere else.
  it('is a registered theme id', () => {
    expect(getThemeList().map((t) => t.id)).toContain(DEFAULT_SETTINGS.theme)
    expect(loadTheme(DEFAULT_SETTINGS.theme).type).toBe('dark')
  })

  // The Manifold pair now carries what used to be Royal, so the default must be the
  // deep navy/gold — not the retired near-black original.
  it('renders the Royal palette under the Manifold name', () => {
    expect(loadTheme('manifold-dark').cssVars['--bg-primary']).toBe('#06080F')
    expect(loadTheme('manifold-light').cssVars['--bg-primary']).toBe('#F6F1E7')
  })
})

describe('retired Royal ids', () => {
  it('are gone from the picker', () => {
    const ids = getThemeList().map((t) => t.id)
    expect(ids).not.toContain('royal-dark')
    expect(ids).not.toContain('royal-light')
  })

  // A saved royal-* id must land on the same colors under its new name. royal-light is
  // the case that bites: unmigrated it hits loadTheme()'s unknown-id fallback, which is
  // dark, so a light-theme user would be flipped to dark on upgrade.
  it('migrate to the Manifold ids of the same type', () => {
    expect(migrateLegacyTheme('royal-dark')).toBe('manifold-dark')
    expect(migrateLegacyTheme('royal-light')).toBe('manifold-light')
    expect(loadTheme(migrateLegacyTheme('royal-light')).type).toBe('light')
  })
})

describe('theme families', () => {
  it('strips the variant suffix', () => {
    expect(themeFamilyOf('jade-light')).toBe('jade')
    expect(themeFamilyOf('manifold-dark')).toBe('manifold')
    // Family ids are already suffix-free and must survive a round trip.
    expect(themeFamilyOf('jade')).toBe('jade')
  })

  it('collapses each dark/light pair into one entry', () => {
    const families = getThemeFamilies()
    const ids = families.map((f) => f.id)

    expect(ids).toEqual(['manifold', 'garfield', 'neon', 'jade', 'platinum'])
    expect(families.map((f) => f.label)).toEqual(['Manifold', 'Garfield', 'Neon', 'Jade', 'Platinum'])
    expect(ids).not.toContain('royal')
  })

  // The list is derived so it cannot outlive the themes it names — the previous
  // hardcoded copy kept offering Royal after that family was retired.
  it('stays in step with the shipped theme list', () => {
    const fromThemes = new Set(getThemeList().map((t) => themeFamilyOf(t.id)))
    expect(new Set(getThemeFamilies().map((f) => f.id))).toEqual(fromThemes)
  })

  it('names a real theme when a family is combined with either variant', () => {
    const ids = getThemeList().map((t) => t.id)
    for (const family of getThemeFamilies()) {
      expect(ids).toContain(`${family.id}-dark`)
      expect(ids).toContain(`${family.id}-light`)
    }
  })
})

describe('custom themes', () => {
  it.each([
    'manifold-dark',
    'manifold-light',
    'garfield-dark',
    'garfield-light',
    'neon-dark',
    'neon-light',
    'jade-dark',
    'jade-light',
    'platinum-dark',
    'platinum-light',
  ])('%s includes colorful markdown token rules', (themeId) => {
    const rules = loadTheme(themeId).monacoTheme.rules
    const tokenSet = new Set(rules.map((rule) => rule.token))

    expect(tokenSet.has('markup.heading.markdown')).toBe(true)
    expect(tokenSet.has('markup.heading.1.markdown')).toBe(true)
    expect(tokenSet.has('markup.bold.markdown')).toBe(true)
    expect(tokenSet.has('markup.underline.link.markdown')).toBe(true)

    const headingRule = rules.find((rule) => rule.token === 'markup.heading.markdown')
    expect(headingRule?.foreground).toBeTruthy()
  })
})

describe('jade & platinum families', () => {
  it.each([
    ['jade-dark', '#5FBF9A', '#4FB8D9'],
    ['jade-light', '#1E6B4F', '#0E7FA0'],
    ['platinum-dark', '#C8CDD6', '#4AC9C9'],
    ['platinum-light', '#3A4150', '#2E8FA8'],
  ])('%s registers with accent %s and running cyan %s', (themeId, accent, runningCyan) => {
    expect(getThemeList().map((t) => t.id)).toContain(themeId)
    const theme = loadTheme(themeId)
    expect(theme.cssVars['--accent']).toBe(accent)
    expect(theme.cssVars['--status-running']).toBe(runningCyan)
  })

  it('platinum-dark resolves dark button text on the silver accent', () => {
    expect(loadTheme('platinum-dark').cssVars['--accent-text']).toBe('#0A0A0C')
  })
})
