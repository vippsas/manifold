import { describe, expect, it } from 'vitest'
import { WebviewContentStore } from './webview-content-store'
import { injectNonce, buildCsp, renderWebviewResponse } from './webview-protocol'

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

describe('renderWebviewResponse', () => {
  it('returns 404 for a missing view', () => {
    const s = new WebviewContentStore()
    const r = renderWebviewResponse(s, 'manifold-webview://view/does.not.exist?v=1')
    expect(r.status).toBe(404)
  })

  it('serves a stored view with a matching nonce in body and csp', () => {
    const s = new WebviewContentStore()
    s.set('manifold.hello.panel', '<script>x()</script>')
    const r = renderWebviewResponse(s, 'manifold-webview://view/manifold.hello.panel?v=3')
    expect(r.status).toBe(200)
    expect(r.csp).toContain("script-src 'nonce-")
    expect(r.body).toContain('<script nonce="')
    // The nonce injected into the served script must equal the nonce in the CSP,
    // otherwise the script could not execute under its own policy.
    const bodyNonce = r.body.match(/<script nonce="([^"]+)"/)?.[1]
    const cspNonce = r.csp?.match(/script-src 'nonce-([^']+)'/)?.[1]
    expect(bodyNonce).toBeTruthy()
    expect(cspNonce).toBeTruthy()
    expect(bodyNonce).toBe(cspNonce)
  })

  it('returns 404 after the view is deleted', () => {
    const s = new WebviewContentStore()
    s.set('view.gone', '<h1>bye</h1>')
    expect(renderWebviewResponse(s, 'manifold-webview://view/view.gone').status).toBe(200)
    s.delete('view.gone')
    expect(renderWebviewResponse(s, 'manifold-webview://view/view.gone').status).toBe(404)
  })
})
