import { GlobalWorkerOptions } from 'pdfjs-dist'
import PdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

// pdf.js parses documents in a web worker. We bundle it with Vite's `?worker`
// suffix (same pattern as monaco-setup.ts) so it loads same-origin under the
// existing CSP. One shared worker handles every document; configured lazily so
// users who never open a PDF don't pay for it.
let configured = false

export function ensurePdfWorker(): void {
  if (configured) return
  GlobalWorkerOptions.workerPort = new PdfjsWorker()
  configured = true
}
