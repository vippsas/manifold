import { spawn } from 'node:child_process'
import type { WatchPeekResult } from './shared-types'
import { ensureYtDlp } from './yt-dlp-fetcher'

// A wide cap because a peek can fall back to the bundled `yt-dlp_macos`, a
// PyInstaller onefile whose cold start alone is 13–21s on macOS (see
// yt-dlp-fetcher.ensureYtDlp, which prefers a fast PATH yt-dlp when present).
const PEEK_TIMEOUT_MS = 25_000
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024

interface RawInfo {
  title?: unknown
  uploader?: unknown
  channel?: unknown
  duration?: unknown
  thumbnail?: unknown
  thumbnails?: unknown
  webpage_url?: unknown
  url?: unknown
  id?: unknown
  _type?: unknown
  entries?: unknown
}

export async function peekVideo(url: string): Promise<WatchPeekResult> {
  if (!isHttpUrl(url)) return { ok: false, error: 'Not a URL' }

  let info: RawInfo
  try {
    info = await dumpJson(url)
  } catch (err) {
    return { ok: false, error: formatYtDlpError(err instanceof Error ? err.message : 'yt-dlp failed') }
  }

  // `--no-playlist` resolves watch?v=…&list=… URLs to the single video, but a
  // pure playlist URL still dumps the whole playlist — reject it.
  if (info._type === 'playlist' || Array.isArray(info.entries)) {
    return { ok: false, error: 'Playlists are not supported — paste a single video URL.' }
  }

  const title = typeof info.title === 'string' ? info.title : undefined
  const uploader = typeof info.uploader === 'string'
    ? info.uploader
    : typeof info.channel === 'string' ? info.channel : undefined
  const durationSeconds = typeof info.duration === 'number' ? info.duration : undefined
  const webpageUrl = typeof info.webpage_url === 'string' ? info.webpage_url : url
  const thumbUrl = pickThumbnailUrl(info)

  let thumbnailDataUrl: string | undefined
  if (thumbUrl) {
    thumbnailDataUrl = await fetchAsDataUrl(thumbUrl).catch(() => undefined)
  }

  return { ok: true, title, uploader, durationSeconds, thumbnailDataUrl, webpageUrl }
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function pickThumbnailUrl(info: RawInfo): string | undefined {
  if (Array.isArray(info.thumbnails)) {
    // yt-dlp orders thumbnails worst→best; the last with width<=1280 is a sweet spot.
    const ranked = info.thumbnails
      .filter((t): t is { url: string; width?: number } =>
        !!t && typeof (t as { url?: unknown }).url === 'string')
      .map((t) => ({ url: t.url, width: typeof t.width === 'number' ? t.width : 0 }))
    const mid = ranked.filter((t) => t.width > 0 && t.width <= 1280).pop()
    if (mid) return mid.url
    const last = ranked[ranked.length - 1]
    if (last) return last.url
  }
  if (typeof info.thumbnail === 'string') return info.thumbnail
  return undefined
}

function formatYtDlpError(message: string): string {
  if (/playlist does not exist|Private video|Sign in/i.test(message)) {
    return 'YouTube refused access — the URL must point to a public video.'
  }
  return message
}

async function dumpJson(url: string, timeoutMs = PEEK_TIMEOUT_MS): Promise<RawInfo> {
  const ytDlpPath = await ensureYtDlp()
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytDlpPath,
      ['-J', '--no-playlist', '--no-warnings', '--skip-download', url],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      settled = true
      proc.kill('SIGTERM')
      reject(new Error('yt-dlp peek timed out'))
    }, timeoutMs)

    proc.stdout.on('data', (b: Buffer) => stdout.push(b))
    proc.stderr.on('data', (b: Buffer) => stderr.push(b))
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject((err as NodeJS.ErrnoException).code === 'ENOENT'
        ? new Error('yt-dlp is not installed')
        : err)
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        const tail = Buffer.concat(stderr).toString('utf-8').trim().split('\n').pop()
        reject(new Error(tail || `yt-dlp exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(stdout).toString('utf-8')) as RawInfo)
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Could not parse yt-dlp JSON'))
      }
    })
  })
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 5_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`thumbnail fetch ${res.status}`)
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_THUMBNAIL_BYTES) {
      throw new Error('thumbnail too large')
    }
    return `data:${contentType};base64,${buf.toString('base64')}`
  } finally {
    clearTimeout(timer)
  }
}
