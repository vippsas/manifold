import { loadTheme } from './registry'

describe('custom themes', () => {
  const brandedThemeIds = ['dark', 'light'].map((variant) => `vip${'ps'}-${variant}`)

  it.each([
    'manifold-dark',
    'manifold-light',
    ...brandedThemeIds,
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
