import { spawn } from 'node:child_process'
import type { WatchPeekResult, WatchPlaylistPeekResult, WatchPlaylistEntry } from '../../shared/watch-types'
import { ensureYtDlp } from './yt-dlp-fetcher'

const PEEK_TIMEOUT_MS = 8_000
const PLAYLIST_PEEK_TIMEOUT_MS = 20_000
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
const PLAYLIST_MAX_ENTRIES = 50
const THUMBNAIL_FETCH_CONCURRENCY = 3

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
    return 'YouTube refused access — the URL must point to a public video or playlist.'
  }
  return message
}

async function dumpJson(url: string, extraArgs: string[] = ['--no-playlist'], timeoutMs = PEEK_TIMEOUT_MS): Promise<RawInfo> {
  const ytDlpPath = await ensureYtDlp()
  return new Promise((resolve, reject) => {
    const proc = spawn(
      ytDlpPath,
      ['-J', ...extraArgs, '--no-warnings', '--skip-download', url],
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

export async function peekPlaylist(url: string): Promise<WatchPlaylistPeekResult> {
  if (!isHttpUrl(url)) return { ok: false, entries: [], error: 'Not a URL' }

  let info: RawInfo
  try {
    info = await dumpJson(url, ['--flat-playlist'], PLAYLIST_PEEK_TIMEOUT_MS)
  } catch (err) {
    return { ok: false, entries: [], error: formatYtDlpError(err instanceof Error ? err.message : 'yt-dlp failed') }
  }

  if (!Array.isArray(info.entries) || info.entries.length === 0) {
    return { ok: false, entries: [], error: 'Playlist has no entries' }
  }

  const playlistTitle = typeof info.title === 'string' ? info.title : undefined
  const uploader = typeof info.uploader === 'string'
    ? info.uploader
    : typeof info.channel === 'string' ? info.channel : undefined

  const rawEntries = info.entries
    .filter((e): e is RawInfo => e !== null && typeof e === 'object')
    .slice(0, PLAYLIST_MAX_ENTRIES)
    .map(parseFlatEntry)
    .filter((e): e is WatchPlaylistEntry => e !== null)

  const entries = await fetchThumbnailsWithCap(rawEntries, THUMBNAIL_FETCH_CONCURRENCY)
  return { ok: true, playlistTitle, uploader, entries }
}

function parseFlatEntry(raw: RawInfo): WatchPlaylistEntry | null {
  // --flat-playlist gives "url" as the canonical entry URL (a watch URL for YouTube).
  const entryUrl = typeof raw.url === 'string'
    ? raw.url
    : typeof raw.webpage_url === 'string' ? raw.webpage_url : undefined
  if (!entryUrl) return null
  const normalizedUrl = entryUrl.startsWith('http') ? entryUrl : `https://www.youtube.com/watch?v=${entryUrl}`
  return {
    url: normalizedUrl,
    title: typeof raw.title === 'string' ? raw.title : undefined,
    uploader: typeof raw.uploader === 'string'
      ? raw.uploader
      : typeof raw.channel === 'string' ? raw.channel : undefined,
    durationSeconds: typeof raw.duration === 'number' ? raw.duration : undefined,
  }
}

async function fetchThumbnailsWithCap(
  entries: WatchPlaylistEntry[],
  concurrency: number,
): Promise<WatchPlaylistEntry[]> {
  const results = [...entries]
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= results.length) return
      const entry = results[i]
      const thumbUrl = youtubeThumbnailUrl(entry.url)
      if (!thumbUrl) continue
      const dataUrl = await fetchAsDataUrl(thumbUrl).catch(() => undefined)
      if (dataUrl) results[i] = { ...entry, thumbnailDataUrl: dataUrl }
    }
  })
  await Promise.all(workers)
  return results
}

function youtubeThumbnailUrl(entryUrl: string): string | null {
  try {
    const u = new URL(entryUrl)
    const id = u.searchParams.get('v') ?? (u.hostname.endsWith('youtu.be') ? u.pathname.slice(1) : null)
    if (!id) return null
    return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
  } catch {
    return null
  }
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
