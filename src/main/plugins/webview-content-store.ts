// src/main/plugins/webview-content-store.ts
/** Holds the current HTML for each plugin webview, keyed by view id.
 *  Written by the extension host ($setHtml); read by the manifold-webview protocol handler. */
export class WebviewContentStore {
  private readonly html = new Map<string, string>()
  private version = 0

  set(viewId: string, html: string): number {
    this.html.set(viewId, html)
    return ++this.version
  }
  get(viewId: string): string | undefined { return this.html.get(viewId) }
  delete(viewId: string): void { this.html.delete(viewId) }
}

export const webviewContentStore = new WebviewContentStore()
