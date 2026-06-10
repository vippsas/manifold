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
 * with no console error. To keep that otherwise-invisible failure observable, we
 * count real `<script>` tags vs. tags actually nonced and emit a `debugLog` warning
 * (tagged with `context`, normally the viewId) on a mismatch.
 *
 * This scans `<script>` tags with a small state machine rather than a global regex
 * because a `<script>` element's body is RAW TEXT that ends only at `</script`: a
 * `<script>` substring inside inlined JS (e.g. React DOM ships the literal
 * `"<script><\/script>"`) is content, NOT a new tag. A regex that nonced it would
 * splice `nonce="…"` into the JS string, break out of the literal, and corrupt the
 * whole bundle ("Unexpected identifier <nonce>") — a blank panel. So after noncing
 * an opening tag we skip its body verbatim up to the next `</script` (callers must
 * already have escaped any `</script` inside inlined JS, as buildWebviewHtml does).
 *
 * Per-tag rules: a tag whose attributes contain an unbalanced quote is a TRUNCATED,
 * malformed tag (a literal `>` inside an attribute value, e.g. `data-x="a>b"`) and is
 * left untouched so we don't corrupt it (the mismatch check flags it). A tag that
 * already carries a `nonce=` is left as-is (a second nonce is ignored by the parser,
 * defeating the CSP) and counts as covered.
 */
export function injectNonce(html: string, nonce: string, context = ''): string {
  const lower = html.toLowerCase()
  let out = ''
  let pos = 0
  let total = 0
  let nonced = 0
  for (;;) {
    const open = lower.indexOf('<script', pos)
    if (open < 0) { out += html.slice(pos); break }
    // Require a word boundary after "<script" (matches the prior /<script\b/), so
    // "<scripting" isn't mistaken for a tag.
    const after = html[open + 7]
    if (after !== undefined && /[a-z0-9_]/i.test(after)) {
      out += html.slice(pos, open + 7)
      pos = open + 7
      continue
    }
    const tagEnd = html.indexOf('>', open)
    if (tagEnd < 0) { total++; out += html.slice(pos); break } // unterminated tag
    total++
    const attrs = html.slice(open + 7, tagEnd)
    out += html.slice(pos, open)
    if (hasUnbalancedQuote(attrs)) {
      out += html.slice(open, tagEnd + 1) // malformed: leave untouched, flagged below
    } else if (/\bnonce\s*=/i.test(attrs)) {
      out += html.slice(open, tagEnd + 1); nonced++ // already nonced
    } else {
      out += `<script${attrs} nonce="${nonce}">`; nonced++
    }
    pos = tagEnd + 1
    // Skip the script body verbatim so "<script" inside inlined JS isn't re-noticed.
    const close = lower.indexOf('</script', pos)
    if (close < 0) { out += html.slice(pos); break }
    out += html.slice(pos, close)
    pos = close
  }
  // Real `<script>` tags we did not (or could not) nonce are exactly the ones the
  // CSP will silently block — surfacing them turns a blank panel into a debuggable
  // log line instead of an invisible failure.
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

/** Restrictive, nonce-gated CSP for plugin webview content. `frameSources` (from the
 *  view's manifest contribution, validated as exact https origins) widens frame-src
 *  for that view only; without it no frames are allowed (default-src 'none'). */
export function buildCsp(nonce: string, frameSources?: readonly string[]): string {
  const directives = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    // 'unsafe-inline' styles are allowed for first-party plugins; revisit (CSS-selector exfil) before untrusted plugins.
    "style-src 'unsafe-inline'",
    "img-src data: blob: https:",
    "font-src data:",
    "connect-src 'none'",
  ]
  if (frameSources !== undefined && frameSources.length > 0) directives.push(`frame-src ${frameSources.join(' ')}`)
  return directives.join('; ')
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
  return { status: 200, body: injectNonce(html, nonce, viewId), contentType: 'text/html; charset=utf-8', csp: buildCsp(nonce, store.getFrameSources(viewId)) }
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
