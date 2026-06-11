import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const fixture = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsMod = require('node:fs') as typeof import('node:fs')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const osMod = require('node:os') as typeof import('node:os')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pathMod = require('node:path') as typeof import('node:path')
  return {
    tempHome: fsMod.mkdtempSync(pathMod.join(osMod.tmpdir(), 'manifold-yt-dlp-')),
    httpsMock: { get: vi.fn() },
    cpMock: { execFileSync: vi.fn() },
  }
})

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fixture.tempHome }
})

vi.mock('node:https', () => fixture.httpsMock)
vi.mock('node:child_process', () => ({ ...fixture.cpMock, default: fixture.cpMock }))
const tempHome = fixture.tempHome
const httpsMock = fixture.httpsMock
const cpMock = fixture.cpMock

let mod: typeof import('./yt-dlp-fetcher')
beforeEach(async () => {
  vi.resetModules()
  httpsMock.get.mockReset()
  // Default: nothing on PATH (`which`/`where` exits non-zero ⇒ throws), so the
  // bundled-download tests below exercise the fallback path.
  cpMock.execFileSync.mockReset()
  cpMock.execFileSync.mockImplementation(() => { throw new Error('not found') })
  fs.rmSync(path.join(tempHome, '.manifold'), { recursive: true, force: true })
  mod = await import('./yt-dlp-fetcher')
})

afterEach(() => {
  fs.rmSync(path.join(tempHome, '.manifold'), { recursive: true, force: true })
})

describe('yt-dlp-fetcher', () => {
  it('reports no bundled binary when target file is missing', () => {
    expect(mod.hasBundledYtDlp()).toBe(false)
  })

  it('points at ~/.manifold/bin/yt-dlp', () => {
    expect(mod.getYtDlpPath()).toBe(path.join(tempHome, '.manifold', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'))
  })

  it('downloads the binary, marks it executable, and reports bundled', async () => {
    httpsMock.get.mockImplementation((_url: string, _opts: unknown, cb: (res: FakeRes) => void) => {
      const res = makeResponse('binary-bytes')
      cb(res)
      return makeRequest()
    })

    const target = await mod.ensureYtDlp()
    expect(fs.readFileSync(target, 'utf-8')).toBe('binary-bytes')
    if (process.platform !== 'win32') {
      const mode = fs.statSync(target).mode & 0o777
      expect(mode & 0o100).toBe(0o100)
    }
    expect(mod.hasBundledYtDlp()).toBe(true)
  })

  it('follows redirects', async () => {
    httpsMock.get
      .mockImplementationOnce((_url: string, _opts: unknown, cb: (res: FakeRes) => void) => {
        cb(makeRedirect('https://example.test/final'))
        return makeRequest()
      })
      .mockImplementationOnce((_url: string, _opts: unknown, cb: (res: FakeRes) => void) => {
        cb(makeResponse('payload'))
        return makeRequest()
      })

    const target = await mod.ensureYtDlp()
    expect(fs.readFileSync(target, 'utf-8')).toBe('payload')
  })

  it('rejects on non-200 status and leaves no partial file', async () => {
    httpsMock.get.mockImplementation((_url: string, _opts: unknown, cb: (res: FakeRes) => void) => {
      const res: FakeRes = {
        statusCode: 404,
        headers: {},
        on: () => res,
        pipe: () => undefined,
        resume: () => undefined,
      }
      cb(res)
      return makeRequest()
    })

    await expect(mod.ensureYtDlp()).rejects.toThrow(/HTTP 404/)
    expect(mod.hasBundledYtDlp()).toBe(false)
  })

  it('is a no-op when the binary already exists', async () => {
    const target = mod.getYtDlpPath()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'preexisting', { mode: 0o755 })

    await mod.ensureYtDlp()
    expect(httpsMock.get).not.toHaveBeenCalled()
    expect(fs.readFileSync(target, 'utf-8')).toBe('preexisting')
  })

  it('prefers a yt-dlp found on PATH over downloading the bundled binary', async () => {
    cpMock.execFileSync.mockReturnValue(Buffer.from('/opt/homebrew/bin/yt-dlp\n'))

    const resolved = await mod.ensureYtDlp()
    expect(resolved).toBe('/opt/homebrew/bin/yt-dlp')
    expect(httpsMock.get).not.toHaveBeenCalled()
  })

  it('prefers PATH even when a bundled binary already exists', async () => {
    const target = mod.getYtDlpPath()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'bundled', { mode: 0o755 })
    cpMock.execFileSync.mockReturnValue(Buffer.from('/opt/homebrew/bin/yt-dlp\n'))

    const resolved = await mod.ensureYtDlp()
    expect(resolved).toBe('/opt/homebrew/bin/yt-dlp')
  })

  it('falls back to the bundled binary when none is on PATH', async () => {
    const target = mod.getYtDlpPath()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, 'bundled', { mode: 0o755 })

    const resolved = await mod.ensureYtDlp()
    expect(resolved).toBe(target)
    expect(httpsMock.get).not.toHaveBeenCalled()
  })
})

interface FakeRes {
  statusCode: number
  headers: Record<string, string>
  on: (event: string, handler: (chunk: Buffer) => void) => FakeRes
  pipe: (dest: fs.WriteStream) => void
  resume: () => void
}

function makeResponse(body: string): FakeRes {
  const handlers: Record<string, (chunk: Buffer) => void> = {}
  const res: FakeRes = {
    statusCode: 200,
    headers: { 'content-length': String(body.length) },
    on: (event, handler) => {
      handlers[event] = handler
      return res
    },
    pipe: (dest) => {
      process.nextTick(() => {
        handlers.data?.(Buffer.from(body))
        dest.end(Buffer.from(body))
      })
    },
    resume: () => undefined,
  }
  return res
}

function makeRedirect(location: string): FakeRes {
  return {
    statusCode: 302,
    headers: { location },
    on: function (this: FakeRes) { return this },
    pipe: () => undefined,
    resume: () => undefined,
  }
}

function makeRequest(): { on: (e: string, cb: (err: Error) => void) => unknown; setTimeout: (ms: number, cb: () => void) => void; destroy: (err: Error) => void } {
  return {
    on: () => undefined,
    setTimeout: () => undefined,
    destroy: () => undefined,
  }
}
