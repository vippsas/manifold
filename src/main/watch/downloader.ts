import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'
import type { DownloadResult } from './types'
import { ensureYtDlp } from './yt-dlp-fetcher'

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.mov', '.m4v', '.avi', '.flv', '.wmv'])

export function isUrl(source: string): boolean {
  try {
    const u = new URL(source)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function resolveLocal(source: string): DownloadResult {
  const expanded = source.startsWith('~')
    ? path.join(process.env.HOME ?? '', source.slice(1))
    : source
  const resolved = path.resolve(expanded)
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`)
  }
  return {
    videoPath: resolved,
    subtitlePath: null,
    info: { title: path.basename(resolved), url: resolved },
    downloaded: false,
  }
}

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export interface DownloadProgress {
  onLog?: (line: string) => void
  signal?: AbortSignal
}

export async function downloadUrl(
  url: string,
  outDir: string,
  progress?: DownloadProgress,
): Promise<DownloadResult> {
  fs.mkdirSync(outDir, { recursive: true })
  const outputTemplate = path.join(outDir, 'video.%(ext)s')

  const args = [
    '-N', '8',
    '-f', 'bv*[height<=720]+ba/b[height<=720]/bv+ba/b',
    '--merge-output-format', 'mp4',
    '--write-info-json',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs', 'en,en-US,en-GB,en-orig',
    '--sub-format', 'vtt',
    '--convert-subs', 'vtt',
    '--no-playlist',
    '--ignore-errors',
    '-o', outputTemplate,
    url,
  ]

  const ytDlpPath = await ensureYtDlp({ onLog: progress?.onLog })
  await runProcess(ytDlpPath, args, progress?.onLog, progress?.signal)

  const video = pickVideo(outDir)
  if (!video) {
    throw new Error(`yt-dlp did not produce a video file in ${outDir}`)
  }
  const subtitle = pickSubtitle(outDir)

  let info: DownloadResult['info'] = { url }
  const infoPath = path.join(outDir, 'video.info.json')
  if (fs.existsSync(infoPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as Record<string, unknown>
      info = {
        title: typeof raw.title === 'string' ? raw.title : undefined,
        uploader: typeof raw.uploader === 'string'
          ? raw.uploader
          : typeof raw.channel === 'string' ? raw.channel : undefined,
        url: typeof raw.webpage_url === 'string' ? raw.webpage_url : url,
      }
    } catch {
      // best effort
    }
  }

  return {
    videoPath: video,
    subtitlePath: subtitle,
    info,
    downloaded: true,
  }
}

export async function download(
  source: string,
  outDir: string,
  progress?: DownloadProgress,
): Promise<DownloadResult> {
  if (isUrl(source)) return downloadUrl(source, outDir, progress)
  return resolveLocal(source)
}

function pickVideo(outDir: string): string | null {
  for (const ext of ['.mp4', '.mkv', '.webm', '.mov']) {
    const matches = fs.readdirSync(outDir)
      .filter((f) => f.startsWith('video') && f.endsWith(ext))
      .sort()
    if (matches.length > 0) return path.join(outDir, matches[0])
  }
  for (const f of fs.readdirSync(outDir)) {
    if (f.startsWith('video.') && VIDEO_EXTS.has(path.extname(f).toLowerCase())) {
      return path.join(outDir, f)
    }
  }
  return null
}

function pickSubtitle(outDir: string): string | null {
  const all = fs.readdirSync(outDir)
    .filter((f) => f.startsWith('video') && f.endsWith('.vtt'))
    .sort()
  if (all.length === 0) return null
  const preferred = all.find((f) => f.includes('.en'))
  return path.join(outDir, preferred ?? all[0])
}

function runProcess(
  command: string,
  args: string[],
  onLog?: (line: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Download aborted'))
      return
    }

    let proc
    try {
      proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }

    let settled = false
    const stderrLines: string[] = []

    const killProc = (reason: string): void => {
      if (settled) return
      settled = true
      proc.kill('SIGTERM')
      setTimeout(() => {
        try { proc.kill('SIGKILL') } catch { /* already gone */ }
      }, 2000)
      reject(new Error(reason))
    }

    const watchdog = setTimeout(() => {
      killProc(`yt-dlp timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`)
    }, DOWNLOAD_TIMEOUT_MS)

    const onAbort = (): void => killProc('Download aborted')
    signal?.addEventListener('abort', onAbort)

    const handleData = (chunk: Buffer): void => {
      const text = chunk.toString('utf-8')
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        onLog?.(line)
        stderrLines.push(line)
      }
    }
    proc.stdout?.on('data', handleData)
    proc.stderr?.on('data', handleData)
    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      signal?.removeEventListener('abort', onAbort)
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`yt-dlp binary missing at ${command} — restart watch to re-download.`))
      } else {
        reject(err)
      }
    })
    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(watchdog)
      signal?.removeEventListener('abort', onAbort)
      if (code !== 0 && code !== null) {
        const tail = stderrLines.slice(-5).join('\n')
        reject(new Error(`yt-dlp exited with code ${code}${tail ? `\n${tail}` : ''}`))
      } else {
        resolve()
      }
    })
  })
}
