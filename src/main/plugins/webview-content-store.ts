// src/main/plugins/webview-content-store.ts
/** Holds the current HTML for each plugin webview, keyed by view id.
 *  Written by the extension host ($setHtml); read by the manifold-webview protocol handler.
 *  Also carries each view's manifest-declared frameSources (registered at plugin scan)
 *  so the protocol handler can widen the CSP frame-src for exactly that view. */
export class WebviewContentStore {
  private readonly html = new Map<string, string>()
  private readonly frameSources = new Map<string, string[]>()
  private version = 0

  set(viewId: string, html: string): number {
    this.html.set(viewId, html)
    return ++this.version
  }
  get(viewId: string): string | undefined { return this.html.get(viewId) }
  delete(viewId: string): void { this.html.delete(viewId) }

  setFrameSources(viewId: string, sources: string[]): void {
    if (sources.length > 0) this.frameSources.set(viewId, [...sources])
    else this.frameSources.delete(viewId)
  }
  getFrameSources(viewId: string): string[] | undefined { return this.frameSources.get(viewId) }
  /** Union of every view's frame sources (deduplicated). */
  allFrameSources(): string[] {
    return [...new Set([...this.frameSources.values()].flat())]
  }
}

export const webviewContentStore = new WebviewContentStore()
