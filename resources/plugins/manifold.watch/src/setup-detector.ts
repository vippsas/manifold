import { execFileSync } from 'node:child_process'
import type { WatchSetupStatus, TranscriptionSettings } from './shared-types'
import { hasBundledYtDlp } from './yt-dlp-fetcher'

interface Options {
  cacheMs?: number
  which?: (binary: string) => boolean
  hasBundled?: (binary: string) => boolean
  getTranscription?: () => TranscriptionSettings | undefined
}

let cached: { at: number; status: WatchSetupStatus } | null = null

export function detectWatchSetup(opts: Options = {}): WatchSetupStatus {
  const cacheMs = opts.cacheMs ?? 5_000
  const which = opts.which ?? defaultWhich
  const hasBundled = opts.hasBundled ?? defaultHasBundled
  if (cached && Date.now() - cached.at < cacheMs) return cached.status

  const transcription = opts.getTranscription?.()
  const provider = transcription?.provider ?? 'none'
  const hasApiKey = providerHasKey(transcription)

  const status: WatchSetupStatus = {
    ffmpeg: which('ffmpeg'),
    ytdlp: hasBundled('yt-dlp') || which('yt-dlp'),
    hasBrew: which('brew'),
    provider,
    hasApiKey,
  }
  cached = { at: Date.now(), status }
  return status
}

export function clearWatchSetupCache(): void {
  cached = null
}

function providerHasKey(t: TranscriptionSettings | undefined): boolean {
  if (!t || t.provider === 'none') return false
  if (t.provider === 'openai') return Boolean(t.openaiApiKey?.trim())
  if (t.provider === 'azure') {
    return Boolean(t.azureApiKey?.trim()) && Boolean(t.azureEndpoint?.trim())
  }
  return false
}

function defaultWhich(binary: string): boolean {
  try {
    execFileSync('which', [binary], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function defaultHasBundled(binary: string): boolean {
  if (binary === 'yt-dlp') return hasBundledYtDlp()
  return false
}
