// src/main/plugins/webview-protocol.ts
// NOTE: `protocol` and `session` are resolved from the electron stub ({}) in
// unit tests, so importing them at the top-level is safe — the stub makes them
// undefined rather than throwing. Only `registerWebviewSchemePrivileged` and
// `installWebviewProtocol` call into these APIs at runtime.
import { protocol, session } from 'electron'
import { randomBytes } from 'node:crypto'
import { debugLog } from '../app/debug-log'
import { webviewContentStore, type WebviewContentStore } from './webview-content-store'

export const WEBVIEW_SCHEME = 'manifold-webview'

/**
 * Add the CSP nonce to every opening `<script ...>` tag (first-party HTML rewrite).
 *
 * The CSP is `script-src 'nonce-…'` under `default-src 'none'`, so any `<script>`
 * that does NOT receive the nonce is silently BLOCKED — the panel renders blank
 * with no console error. The naive `/<script\b([^>]*)>/` regex truncates at the
 * first `>`, so a literal `>` inside an attribute value (e.g. `data-x="a>b"`)
 * makes that tag impossible to nonce. To keep an otherwise-invisible failure
 * observable, we count `<script` occurrences vs. tags actually nonced and emit a
 * `debugLog` warning (tagged with `context`, normally the viewId) on a mismatch.
 *
 * A `<script>` that already carries a `nonce=` attribute is left untouched: adding
 * a second `nonce` attribute is ignored by the parser, which would defeat the CSP.
 * It counts as "covered" (not a mismatch).
 */
export function injectNonce(html: string, nonce: string, context = ''): string {
  let nonced = 0
  const out = html.replace(/<script\b([^>]*)>/gi, (m, attrs: string) => {
    // The regex stops at the first '>'. If a quote in `attrs` is left open, that
    // '>' was inside an attribute value (e.g. data-x="a>b") and this is a
    // TRUNCATED, malformed tag — injecting here would corrupt it, so skip it and
    // let the mismatch check below flag it.
    if (hasUnbalancedQuote(attrs)) return m
    // Already has a nonce attribute: don't append a duplicate (the HTML parser
    // ignores the second one, which would defeat the CSP nonce). Count as covered.
    if (/\bnonce\s*=/i.test(attrs)) {
      nonced++
      return m
    }
    nonced++
    return `<script${attrs} nonce="${nonce}">`
  })
  // `<script` occurrences we did not (or could not) nonce are exactly the tags the
  // CSP will silently block — surfacing them turns a blank panel into a debuggable
  // log line instead of an invisible failure.
  const total = (html.match(/<script\b/gi) ?? []).length
  if (total > nonced) {
    const where = context ? ` for ${context}` : ''
    debugLog(
      `[webview-protocol] CSP nonce injection incomplete${where}: nonced ${nonced}/${total} <script> tag(s); ` +
        `un-nonced scripts will be blocked by 'script-src nonce' and the panel may render blank`,
    )
  }
  return out
}

/** True if `s` contains an unterminated single- or double-quoted run. */
function hasUnbalancedQuote(s: string): boolean {
  let quote: '"' | "'" | null = null
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    }
  }
  return quote !== null
}

/** Restrictive, nonce-gated CSP for plugin webview content. */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    // 'unsafe-inline' styles are allowed for first-party plugins; revisit (CSS-selector exfil) before untrusted plugins.
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
    "font-src data:",
    "connect-src 'none'",
  ].join('; ')
}

function makeNonce(): string {
  return randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '')
}

/** MUST be called BEFORE app.whenReady(). */
export function registerWebviewSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: WEBVIEW_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } },
  ])
}

export interface WebviewResponse { status: number; body: string; contentType: string; csp?: string }

/**
 * Pure: decide the response for a manifold-webview://view/<id>?v=<n> request.
 *
 * URL shape: manifold-webview://view/<viewId>?v=<version>
 *   - host    = "view"
 *   - pathname = "/<viewId>"   (URL-encoded; decoded here)
 *   - ?v=<n>  = cache-bust query param produced by the renderer on each HTML update
 */
export function renderWebviewResponse(store: WebviewContentStore, requestUrl: string): WebviewResponse {
  const url = new URL(requestUrl)
  const viewId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const html = store.get(viewId)
  if (html === undefined) return { status: 404, body: 'not found', contentType: 'text/plain' }
  const nonce = makeNonce()
  return { status: 200, body: injectNonce(html, nonce, viewId), contentType: 'text/html; charset=utf-8', csp: buildCsp(nonce) }
}

/**
 * MUST be called AFTER app.whenReady(). Serves manifold-webview://view/<id> from the store
 * with a fresh nonce CSP on every request.
 */
export function installWebviewProtocol(store: WebviewContentStore = webviewContentStore): void {
  session.defaultSession.protocol.handle(WEBVIEW_SCHEME, (request) => {
    const r = renderWebviewResponse(store, request.url)
    const headers: Record<string, string> = { 'content-type': r.contentType }
    if (r.csp) headers['content-security-policy'] = r.csp
    return new Response(r.body, { status: r.status, headers })
  })
}
