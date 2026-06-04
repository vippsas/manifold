// src/main/plugins/webview-protocol.ts
// NOTE: `protocol` and `session` are resolved from the electron stub ({}) in
// unit tests, so importing them at the top-level is safe — the stub makes them
// undefined rather than throwing. Only `registerWebviewSchemePrivileged` and
// `installWebviewProtocol` call into these APIs at runtime.
import { protocol, session } from 'electron'
import { randomBytes } from 'node:crypto'
import { webviewContentStore, type WebviewContentStore } from './webview-content-store'

export const WEBVIEW_SCHEME = 'manifold-webview'

/** Add a nonce attribute to every opening <script ...> tag (first-party HTML rewrite). */
// First-party HTML only: a literal '>' inside a <script> attribute value, or pre-existing nonce attrs, are not handled (acceptable — the store holds raw plugin HTML and we inject exactly once per serve).
export function injectNonce(html: string, nonce: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_m, attrs: string) => `<script${attrs} nonce="${nonce}">`)
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
  return { status: 200, body: injectNonce(html, nonce), contentType: 'text/html; charset=utf-8', csp: buildCsp(nonce) }
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
