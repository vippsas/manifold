import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendPrivateEvent, pruneCrashArtifacts, startCrashDiagnostics } from './crash-diagnostics'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('startCrashDiagnostics', () => {
  it('stores local dumps and JSONL events without uploading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const handlers = new Map<string, (...args: unknown[]) => void>()
    const crashReporter = { start: vi.fn() }
    const app = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler)),
      setPath: vi.fn(),
    }

    startCrashDiagnostics({ app, crashReporter, root })

    expect(app.setPath).toHaveBeenCalledWith('crashDumps', join(root, 'dumps'))
    expect(crashReporter.start).toHaveBeenCalledWith({
      companyName: 'Manifold',
      productName: 'Manifold',
      submitURL: '',
      uploadToServer: false,
      compress: false,
      ignoreSystemCrashHandler: true,
    })

    await vi.waitFor(async () => {
      const events = await readFile(join(root, 'events.jsonl'), 'utf8')
      expect(events).toContain('"event":"diagnostics-started"')
    })

    handlers.get('child-process-gone')?.({}, {
      type: 'GPU',
      reason: 'crashed',
      exitCode: 139,
      serviceName: 'secret-service-name',
      name: 'secret-process-name',
    })

    await vi.waitFor(async () => {
      const events = await readFile(join(root, 'events.jsonl'), 'utf8')
      expect(events).toContain('"event":"child-process-gone"')
      expect(events).toContain('"type":"GPU"')
      expect(events).toContain('"reason":"crashed"')
      expect(events).toContain('"exitCode":139')
      expect(events).not.toContain('secret-service-name')
      expect(events).not.toContain('secret-process-name')
      expect((await stat(root)).mode & 0o777).toBe(0o700)
      expect((await stat(join(root, 'dumps'))).mode & 0o777).toBe(0o700)
      expect((await stat(join(root, 'events.jsonl'))).mode & 0o777).toBe(0o600)
    })
  })

  it('records renderer exits without navigation URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const appHandlers = new Map<string, (...args: unknown[]) => void>()
    const webHandlers = new Map<string, (...args: unknown[]) => void>()
    const app = {
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => appHandlers.set(event, handler)),
      setPath: vi.fn(),
    }
    const webContents = { on: vi.fn((event: string, handler: (...args: unknown[]) => void) => webHandlers.set(event, handler)) }

    const diagnostics = startCrashDiagnostics({
      app,
      crashReporter: { start: vi.fn() },
      root,
    })
    diagnostics.observeWebContents(webContents)
    diagnostics.recordGpuStatus({ compositing: 'disabled_software', webgl: 'unavailable_off' })

    webHandlers.get('render-process-gone')?.({}, { reason: 'crashed', exitCode: 139 })

    await vi.waitFor(async () => {
      const events = await readFile(join(root, 'events.jsonl'), 'utf8')
      expect(events).toContain('"event":"render-process-gone"')
      expect(events).toContain('"reason":"crashed"')
      expect(events).toContain('"event":"gpu-feature-status"')
      expect(events).toContain('"compositing":"disabled_software"')
      expect(events).toContain('"webgl":"unavailable_off"')
      expect(events).not.toMatch(/https?:\/\//)
    })
  })

  it('does not block startup when Crashpad initialization fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const app = { on: vi.fn(), setPath: vi.fn() }

    expect(() => startCrashDiagnostics({
      app,
      crashReporter: { start: vi.fn(() => { throw new Error('crashpad unavailable') }) },
      root,
    })).not.toThrow()
    expect(app.on).not.toHaveBeenCalled()
  })

  it('removes crash artifacts older than seven days', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const pending = join(root, 'pending')
    await mkdir(pending)
    const stale = join(pending, 'stale.dmp')
    const recent = join(pending, 'recent.dmp')
    await writeFile(stale, '')
    await writeFile(recent, '')
    const now = Date.now()
    await utimes(stale, new Date(now - 8 * 24 * 60 * 60 * 1000), new Date(now - 8 * 24 * 60 * 60 * 1000))

    pruneCrashArtifacts(root, now)

    await expect(stat(stale)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(recent)).resolves.toBeDefined()
  })

  it('bounds the event log instead of growing indefinitely', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const events = join(root, 'events.jsonl')
    await writeFile(events, 'x'.repeat(1024 * 1024))

    await appendPrivateEvent(events, '{"event":"latest"}')

    await expect(readFile(events, 'utf8')).resolves.toBe('{"event":"latest"}\n')
  })

  it('serializes concurrent event writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'manifold-diagnostics-'))
    roots.push(root)
    const events = join(root, 'events.jsonl')

    await Promise.all([
      appendPrivateEvent(events, '{"event":"first"}'),
      appendPrivateEvent(events, '{"event":"second"}'),
    ])

    await expect(readFile(events, 'utf8')).resolves.toBe(
      '{"event":"first"}\n{"event":"second"}\n',
    )
  })
})
