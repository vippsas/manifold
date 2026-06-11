import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebviewContentStore } from './webview-content-store'
import { injectNonce, buildCsp, renderWebviewResponse, frameReferrerPatch } from './webview-protocol'

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

  it('leaves an inlined bundle intact inside a full webview document (only the wrapper is nonced)', () => {
    // Mirrors the served shape: buildWebviewHtml wraps the bundle as `<script>…</script>`
    // after escaping `</script` → `<\/script`. The bundle here carries the React-DOM literal
    // and another escaped close; both must survive injectNonce byte-for-byte.
    const bundle = '(()=>{var a=document.createElement("div");a.innerHTML="<script><\\/script>";var s="x<\\/script>y";})()'
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${bundle}</script></body></html>`
    const out = injectNonce(html, 'N0NCE', 'view.full')
    expect(out).toContain(`<script nonce="N0NCE">${bundle}</script>`)
    expect((out.match(/nonce=/g) ?? []).length).toBe(1)
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
  it('has no frame-src without frame sources (empty list included)', () => {
    expect(buildCsp('N0NCE')).not.toContain('frame-src')
    expect(buildCsp('N0NCE', [])).not.toContain('frame-src')
  })
  it('appends frame-src for declared origins', () => {
    const csp = buildCsp('N0NCE', ['https://www.youtube.com', 'https://player.vimeo.com'])
    expect(csp).toContain('frame-src https://www.youtube.com https://player.vimeo.com')
    // The rest of the policy is unchanged.
    expect(csp).toContain("default-src 'none'")
  })
})

describe('WebviewContentStore frame sources', () => {
  it('stores and clears frame sources per view', () => {
    const s = new WebviewContentStore()
    s.setFrameSources('view.a', ['https://www.youtube.com'])
    expect(s.getFrameSources('view.a')).toEqual(['https://www.youtube.com'])
    s.setFrameSources('view.a', [])
    expect(s.getFrameSources('view.a')).toBeUndefined()
    expect(s.getFrameSources('never-set')).toBeUndefined()
  })

  it('unions frame sources across views, deduplicated', () => {
    const s = new WebviewContentStore()
    s.setFrameSources('view.a', ['https://www.youtube.com'])
    s.setFrameSources('view.b', ['https://www.youtube.com', 'https://player.vimeo.com'])
    expect(s.allFrameSources().sort()).toEqual(['https://player.vimeo.com', 'https://www.youtube.com'])
    expect(new WebviewContentStore().allFrameSources()).toEqual([])
  })
})

describe('frameReferrerPatch', () => {
  const headers = { Accept: 'text/html' }
  const details = (over: Partial<{ resourceType: string; url: string; requestHeaders: Record<string, string> }> = {}) => ({
    resourceType: 'subFrame',
    url: 'https://www.youtube.com/embed/abc?feature=oembed',
    requestHeaders: { ...headers },
    ...over,
  })
  const ORIGINS = ['https://www.youtube.com']
  const REFERRER = 'http://127.0.0.1:41776'

  it('adds the loopback Referer to a sub-frame request for a declared origin', () => {
    const patched = frameReferrerPatch(details(), ORIGINS, REFERRER)
    expect(patched).toEqual({ Accept: 'text/html', Referer: REFERRER })
  })

  it('leaves an existing Referer alone (any casing)', () => {
    expect(frameReferrerPatch(details({ requestHeaders: { Referer: 'https://a' } }), ORIGINS, REFERRER)).toBeNull()
    expect(frameReferrerPatch(details({ requestHeaders: { referer: 'https://a' } }), ORIGINS, REFERRER)).toBeNull()
  })

  it('ignores non-sub-frame requests and undeclared origins', () => {
    expect(frameReferrerPatch(details({ resourceType: 'mainFrame' }), ORIGINS, REFERRER)).toBeNull()
    expect(frameReferrerPatch(details({ resourceType: 'xhr' }), ORIGINS, REFERRER)).toBeNull()
    expect(frameReferrerPatch(details({ url: 'https://evil.example/embed/abc' }), ORIGINS, REFERRER)).toBeNull()
    // Origin match is exact — a registered origin must not match a lookalike host.
    expect(frameReferrerPatch(details({ url: 'https://www.youtube.com.evil.example/embed' }), ORIGINS, REFERRER)).toBeNull()
  })

  it('does nothing without a referrer to inject or with no declared origins', () => {
    expect(frameReferrerPatch(details(), ORIGINS, '')).toBeNull()
    expect(frameReferrerPatch(details(), [], REFERRER)).toBeNull()
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

  it('serves a frame-src CSP only for views with registered frame sources', () => {
    const s = new WebviewContentStore()
    s.set('with-frames', '<html></html>')
    s.set('plain', '<html></html>')
    s.setFrameSources('with-frames', ['https://www.youtube.com'])
    const withFrames = renderWebviewResponse(s, 'manifold-webview://view/with-frames?v=1')
    const plain = renderWebviewResponse(s, 'manifold-webview://view/plain?v=1')
    expect(withFrames.csp).toContain('frame-src https://www.youtube.com')
    expect(plain.csp).not.toContain('frame-src')
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
