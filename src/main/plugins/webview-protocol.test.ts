import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebviewContentStore } from './webview-content-store'
import { injectNonce, buildCsp, renderWebviewResponse } from './webview-protocol'

const debugLogMock = vi.hoisted(() => vi.fn())
vi.mock('../app/debug-log', () => ({ debugLog: debugLogMock }))

beforeEach(() => debugLogMock.mockClear())
afterEach(() => debugLogMock.mockClear())

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

  it('warns via debugLog when a <script> tag cannot be nonced (attribute value contains ">")', () => {
    // The naive /<script\b([^>]*)>/ regex stops at the first '>', so the literal
    // '>' inside data-foo="a>b" makes this tag impossible to nonce → CSP blocks it.
    const html = '<script data-foo="a>b">go()</script>'
    const out = injectNonce(html, 'N0NCE', 'view.bad')
    // No valid nonce was injected onto the (only) script tag.
    expect(out).not.toContain('nonce="N0NCE"')
    expect(debugLogMock).toHaveBeenCalledTimes(1)
    const msg = debugLogMock.mock.calls[0][0] as string
    expect(msg).toContain('view.bad')
  })

  it('warns via debugLog when only some <script> tags get a nonce', () => {
    const html = '<script>ok()</script><script data-x="a>b">bad()</script>'
    injectNonce(html, 'N0NCE', 'view.partial')
    expect(debugLogMock).toHaveBeenCalledTimes(1)
    expect(debugLogMock.mock.calls[0][0]).toContain('view.partial')
  })

  it('does not warn for well-formed first-party HTML', () => {
    injectNonce('<script>a()</script><script type="module">b()</script>', 'N0NCE', 'view.ok')
    expect(debugLogMock).not.toHaveBeenCalled()
  })

  it('does not nonce a "<script>" substring inside a script body (regression: inlined React bundle)', () => {
    // React DOM ships the literal `"<script><\/script>"` inside its bundle. A <script>
    // element's body is raw text that ends only at </script>, so a "<script>" occurring
    // inside the body must NOT be treated as a real tag — splicing nonce="…" into it
    // breaks out of the JS string ("Unexpected identifier <nonce>") and the panel renders
    // blank. (buildWebviewHtml has already escaped the closing tag to <\/script>.)
    const body = 'a.innerHTML = "<script><\\/script>";'
    const out = injectNonce(`<script>${body}</script>`, 'N0NCE', 'view.react')
    expect(out).toBe(`<script nonce="N0NCE">${body}</script>`)
    // The inner substring is untouched: exactly one nonce attribute total.
    expect((out.match(/nonce=/g) ?? []).length).toBe(1)
    // A faithfully-nonced first-party bundle must not trigger the incomplete-injection warning.
    expect(debugLogMock).not.toHaveBeenCalled()
  })

  it('does not re-inject a nonce into a <script> that already has one', () => {
    const out = injectNonce('<script nonce="EXISTING">a()</script>', 'N0NCE', 'view.pre')
    // Exactly one nonce attribute, and the CSP nonce replaces (or is unified with)
    // the pre-existing one rather than appending a duplicate.
    expect((out.match(/nonce=/g) ?? []).length).toBe(1)
    expect(out).not.toContain('nonce="EXISTING" nonce=')
    expect(out).not.toContain('nonce="N0NCE" nonce=')
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

  it('warns with the viewId when a stored view has an un-nonceable <script>', () => {
    const s = new WebviewContentStore()
    s.set('manifold.broken.panel', '<script data-foo="a>b">x()</script>')
    renderWebviewResponse(s, 'manifold-webview://view/manifold.broken.panel?v=1')
    expect(debugLogMock).toHaveBeenCalledTimes(1)
    expect(debugLogMock.mock.calls[0][0]).toContain('manifold.broken.panel')
  })

  it('returns 404 after the view is deleted', () => {
    const s = new WebviewContentStore()
    s.set('view.gone', '<h1>bye</h1>')
    expect(renderWebviewResponse(s, 'manifold-webview://view/view.gone').status).toBe(200)
    s.delete('view.gone')
    expect(renderWebviewResponse(s, 'manifold-webview://view/view.gone').status).toBe(404)
  })
})
