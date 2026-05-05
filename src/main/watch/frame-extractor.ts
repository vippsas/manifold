import * as fs from 'node:fs'
import * as path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { FrameExtractionResult, FrameInfo, VideoMetadata } from './types'

const execFileP = promisify(execFile)

export const MAX_FPS = 2.0

export function parseTime(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number') return value
  const s = value.trim()
  if (!s) return undefined
  const parts = s.split(':')
  if (parts.length === 1) return Number(parts[0])
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1])
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  throw new Error(`Cannot parse time value: ${value} (expected SS, MM:SS, or HH:MM:SS)`)
}

export function formatTime(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`
  return `${pad2(m)}:${pad2(s)}`
}

export async function getMetadata(videoPath: string): Promise<VideoMetadata> {
  let stdout: string
  try {
    const result = await execFileP('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      videoPath,
    ])
    stdout = result.stdout
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('ffprobe is not installed. Install with: brew install ffmpeg')
    }
    throw err
  }
  const data = JSON.parse(stdout || '{}') as {
    streams?: Array<Record<string, unknown>>
    format?: Record<string, unknown>
  }
  const streams = data.streams ?? []
  const fmt = data.format ?? {}
  const videoStream = streams.find((s) => s.codec_type === 'video') ?? {}
  const audioStream = streams.find((s) => s.codec_type === 'audio')
  const durationRaw = (fmt.duration ?? videoStream.duration ?? 0) as string | number
  const duration = typeof durationRaw === 'string' ? Number(durationRaw) : durationRaw
  return {
    durationSeconds: Number.isFinite(duration) ? duration : 0,
    width: typeof videoStream.width === 'number' ? videoStream.width : undefined,
    height: typeof videoStream.height === 'number' ? videoStream.height : undefined,
    codec: typeof videoStream.codec_name === 'string' ? videoStream.codec_name : undefined,
    hasAudio: audioStream !== undefined,
  }
}

function clampFps(fps: number, durationSeconds: number, maxFrames: number): { fps: number; target: number } {
  const clamped = Math.min(fps, MAX_FPS)
  const target = Math.min(maxFrames, Math.max(1, Math.round(clamped * durationSeconds)))
  return { fps: clamped, target }
}

export function autoFps(durationSeconds: number, maxFrames = 100): { fps: number; target: number } {
  if (durationSeconds <= 0) return { fps: 1, target: 1 }
  let target: number
  if (durationSeconds <= 30) target = Math.min(maxFrames, Math.max(12, Math.round(durationSeconds)))
  else if (durationSeconds <= 60) target = Math.min(maxFrames, 40)
  else if (durationSeconds <= 180) target = Math.min(maxFrames, 60)
  else if (durationSeconds <= 600) target = Math.min(maxFrames, 80)
  else target = maxFrames
  return clampFps(target / durationSeconds, durationSeconds, maxFrames)
}

export function autoFpsFocus(durationSeconds: number, maxFrames = 100): { fps: number; target: number } {
  if (durationSeconds <= 0) return { fps: Math.min(MAX_FPS, 2), target: 2 }
  let target: number
  if (durationSeconds <= 5) target = Math.min(maxFrames, Math.max(10, Math.round(durationSeconds * 6)))
  else if (durationSeconds <= 15) target = Math.min(maxFrames, Math.max(30, Math.round(durationSeconds * 4)))
  else if (durationSeconds <= 30) target = Math.min(maxFrames, 60)
  else if (durationSeconds <= 60) target = Math.min(maxFrames, 80)
  else target = maxFrames
  return clampFps(target / durationSeconds, durationSeconds, maxFrames)
}

export interface ExtractOptions {
  videoPath: string
  outDir: string
  fps: number
  resolutionPx?: number
  maxFrames?: number
  startSeconds?: number
  endSeconds?: number
}

export async function extract(opts: ExtractOptions): Promise<FrameInfo[]> {
  const { videoPath, outDir, fps } = opts
  const resolutionPx = opts.resolutionPx ?? 512
  const maxFrames = opts.maxFrames ?? 100

  fs.mkdirSync(outDir, { recursive: true })
  for (const file of fs.readdirSync(outDir)) {
    if (file.startsWith('frame_') && file.endsWith('.jpg')) {
      fs.unlinkSync(path.join(outDir, file))
    }
  }

  const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y']
  if (opts.startSeconds !== undefined) args.push('-ss', opts.startSeconds.toFixed(3))
  if (opts.endSeconds !== undefined) args.push('-to', opts.endSeconds.toFixed(3))
  args.push(
    '-i', videoPath,
    '-vf', `fps=${fps},scale=${resolutionPx}:-2`,
    '-frames:v', String(maxFrames),
    '-q:v', '4',
    path.join(outDir, 'frame_%04d.jpg'),
  )

  try {
    await execFileP('ffmpeg', args, { maxBuffer: 16 * 1024 * 1024 })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('ffmpeg is not installed. Install with: brew install ffmpeg')
    }
    const stderr = (err as { stderr?: string }).stderr ?? ''
    throw new Error(`ffmpeg frame extraction failed: ${stderr.trim() || (err as Error).message}`)
  }

  const offset = opts.startSeconds ?? 0
  const frameFiles = fs.readdirSync(outDir)
    .filter((f) => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort()

  return frameFiles.map((name, i) => ({
    index: i,
    timestampSeconds: round2(offset + (fps > 0 ? i / fps : 0)),
    path: path.join(outDir, name),
  }))
}

export async function extractWithAutoFps(opts: {
  videoPath: string
  outDir: string
  durationSeconds: number
  startSeconds?: number
  endSeconds?: number
  maxFrames?: number
  resolutionPx?: number
  fpsOverride?: number
}): Promise<FrameExtractionResult> {
  const maxFrames = opts.maxFrames ?? 100
  const focused = opts.startSeconds !== undefined || opts.endSeconds !== undefined
  const effectiveStart = opts.startSeconds ?? 0
  const effectiveEnd = opts.endSeconds ?? opts.durationSeconds
  const effectiveDuration = Math.max(0, effectiveEnd - effectiveStart)

  let fps: number
  let target: number
  if (opts.fpsOverride !== undefined) {
    fps = Math.min(opts.fpsOverride, MAX_FPS)
    target = Math.max(1, Math.round(fps * effectiveDuration))
  } else if (focused) {
    ({ fps, target } = autoFpsFocus(effectiveDuration, maxFrames))
  } else {
    ({ fps, target } = autoFps(effectiveDuration, maxFrames))
  }

  const frames = await extract({
    videoPath: opts.videoPath,
    outDir: opts.outDir,
    fps,
    resolutionPx: opts.resolutionPx,
    maxFrames,
    startSeconds: opts.startSeconds,
    endSeconds: opts.endSeconds,
  })

  return { frames, fps, target, focused }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
function pad2(n: number): string { return n.toString().padStart(2, '0') }
