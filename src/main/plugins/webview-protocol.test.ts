import { describe, expect, it } from 'vitest'
import { WebviewContentStore } from './webview-content-store'
import { injectNonce, buildCsp } from './webview-protocol'

describe('WebviewContentStore', () => {
  it('stores html per view and bumps version on each set', () => {
    const s = new WebviewContentStore()
    const v1 = s.set('view.a', '<h1>1</h1>')
    const v2 = s.set('view.a', '<h1>2</h1>')
    expect(v2).toBeGreaterThan(v1)
    expect(s.get('view.a')).toBe('<h1>2</h1>')
    expect(s.get('missing')).toBeUndefined()
  })
})

describe('injectNonce', () => {
  it('adds the nonce to every <script> tag (opening tags only)', () => {
    const out = injectNonce('<script>a()</script><script type="module">b()</script>', 'N0NCE')
    expect(out).toBe('<script nonce="N0NCE">a()</script><script type="module" nonce="N0NCE">b()</script>')
  })
  it('does not touch non-script tags', () => {
    expect(injectNonce('<div>x</div>', 'N')).toBe('<div>x</div>')
  })
})

describe('buildCsp', () => {
  it('is nonce-gated and locked down by default', () => {
    const csp = buildCsp('N0NCE')
    expect(csp).toContain("script-src 'nonce-N0NCE'")
    expect(csp).toContain("default-src 'none'")
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/)
    // script-src must NOT contain unsafe-inline (nonce only)
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })
})
