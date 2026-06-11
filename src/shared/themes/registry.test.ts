import { getThemeList, loadTheme } from './registry'

describe('custom themes', () => {
  it.each([
    'manifold-dark',
    'manifold-light',
    'garfield-dark',
    'garfield-light',
    'neon-dark',
    'neon-light',
    'royal-dark',
    'royal-light',
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
