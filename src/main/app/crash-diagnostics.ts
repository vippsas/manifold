import { chmodSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { appendFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface AppLike {
  on(event: 'child-process-gone', handler: (_event: unknown, details: ChildProcessGoneDetails) => void): unknown
  setPath(name: 'crashDumps', path: string): void
}

interface CrashReporterLike {
  start(options: {
    companyName: string
    productName: string
    submitURL: string
    uploadToServer: boolean
    compress: boolean
    ignoreSystemCrashHandler: boolean
  }): void
}

interface WebContentsLike {
  on(event: 'render-process-gone', handler: (_event: unknown, details: RenderProcessGoneDetails) => void): unknown
}

interface ChildProcessGoneDetails {
  type?: string
  reason?: string
  exitCode?: number
}

interface RenderProcessGoneDetails {
  reason?: string
  exitCode?: number
}

interface CrashDiagnosticsOptions {
  app: AppLike
  crashReporter: CrashReporterLike
  root: string
}

export interface CrashDiagnostics {
  observeWebContents(webContents: WebContentsLike): void
  recordGpuStatus(status: Record<string, string>): void
}

export function startCrashDiagnostics(options: CrashDiagnosticsOptions): CrashDiagnostics {
  const { app, crashReporter, root } = options
  const dumpsDir = join(root, 'dumps')
  const eventsFile = join(root, 'events.jsonl')
  try {
    mkdirSync(dumpsDir, { recursive: true })
    chmodSync(root, 0o700)
    chmodSync(dumpsDir, 0o700)
    app.setPath('crashDumps', dumpsDir)
    crashReporter.start({
      companyName: 'Manifold',
      productName: 'Manifold',
      submitURL: '',
      uploadToServer: false,
      compress: false,
      ignoreSystemCrashHandler: true,
    })
  } catch {
    return NOOP_DIAGNOSTICS
  }

  const record = (event: string, details: { type?: string; reason?: string; exitCode?: number }): void => {
    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...(details.type ? { type: details.type } : {}),
      ...(details.reason ? { reason: details.reason } : {}),
      ...(typeof details.exitCode === 'number' ? { exitCode: details.exitCode } : {}),
    })
    void appendPrivateEvent(eventsFile, entry)
  }

  app.on('child-process-gone', (_event, details) => {
    record('child-process-gone', details)
  })
  const pruneTimer = setTimeout(() => pruneCrashArtifacts(dumpsDir), 0)
  pruneTimer.unref?.()
  record('diagnostics-started', {})

  return {
    observeWebContents(webContents): void {
      webContents.on('render-process-gone', (_event, details) => {
        record('render-process-gone', details)
      })
    },
    recordGpuStatus(status): void {
      const safeStatus = Object.fromEntries(
        Object.entries(status).filter(([, value]) => typeof value === 'string'),
      )
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'gpu-feature-status',
        ...safeStatus,
      })
      void appendPrivateEvent(eventsFile, entry)
    },
  }
}

const NOOP_DIAGNOSTICS: CrashDiagnostics = {
  observeWebContents: () => {},
  recordGpuStatus: () => {},
}

const CRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const CRASH_ARTIFACT_DIRS = ['attachments', 'completed', 'new', 'pending']

export function pruneCrashArtifacts(dumpsDir: string, now = Date.now()): void {
  const cutoff = now - CRASH_RETENTION_MS
  for (const directory of CRASH_ARTIFACT_DIRS) {
    const path = join(dumpsDir, directory)
    let entries: string[]
    try { entries = readdirSync(path) } catch { continue }
    for (const entry of entries) {
      const file = join(path, entry)
      try {
        if (statSync(file).mtimeMs < cutoff) rmSync(file, { recursive: true, force: true })
      } catch { /* best-effort retention */ }
    }
  }
}

const MAX_EVENT_LOG_BYTES = 1024 * 1024
const eventWriteQueues = new Map<string, Promise<void>>()

export async function appendPrivateEvent(file: string, entry: string): Promise<void> {
  const previous = eventWriteQueues.get(file) ?? Promise.resolve()
  const next = previous.then(() => writePrivateEvent(file, entry))
  eventWriteQueues.set(file, next)
  try {
    await next
  } finally {
    if (eventWriteQueues.get(file) === next) eventWriteQueues.delete(file)
  }
}

async function writePrivateEvent(file: string, entry: string): Promise<void> {
  try {
    const size = await stat(file).then((value) => value.size).catch(() => 0)
    if (size >= MAX_EVENT_LOG_BYTES) {
      await writeFile(file, `${entry}\n`, { encoding: 'utf8', mode: 0o600 })
    } else {
      await appendFile(file, `${entry}\n`, { encoding: 'utf8', mode: 0o600 })
    }
    chmodSync(file, 0o600)
  } catch {
    // Best-effort diagnostics must never surface as an app error.
  }
}
