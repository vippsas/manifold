import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// pdf.js parses documents in a web worker. We point it at the Vite-bundled
// worker URL (`?url`) rather than a single shared `workerPort`: that lets pdf.js
// spawn and tear down a fresh worker per document, so destroying one viewer's
// document (tab switch, unmount/remount, React StrictMode's double-invoke)
// never destroys a worker another viewer still needs. The URL is same-origin,
// so it loads under the existing CSP. Configured once, lazily.
let configured = false

export function ensurePdfWorker(): void {
  if (configured) return
  GlobalWorkerOptions.workerSrc = workerUrl
  configured = true
}
