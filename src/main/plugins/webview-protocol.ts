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
export function injectNonce(html: string, nonce: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_m, attrs: string) => `<script${attrs} nonce="${nonce}">`)
}

/** Restrictive, nonce-gated CSP for plugin webview content. */
export function buildCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
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

/**
 * MUST be called AFTER app.whenReady(). Serves manifold-webview://view/<id> from the store
 * with a fresh nonce CSP on every request.
 *
 * URL shape: manifold-webview://view/<viewId>?v=<version>
 *   - host    = "view"
 *   - pathname = "/<viewId>"   (URL-encoded; decoded here)
 *   - ?v=<n>  = cache-bust query param produced by the renderer on each HTML update
 */
export function installWebviewProtocol(store: WebviewContentStore = webviewContentStore): void {
  session.defaultSession.protocol.handle(WEBVIEW_SCHEME, (request) => {
    const url = new URL(request.url)
    // URL is manifold-webview://view/<viewId>?v=<n> — host="view", pathname="/<viewId>"
    const viewId = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const html = store.get(viewId)
    if (html === undefined) return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } })
    const nonce = makeNonce()
    return new Response(injectNonce(html, nonce), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': buildCsp(nonce) },
    })
  })
}
