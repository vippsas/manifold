import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { WatchSetupStatus } from '../../shared/watch-types'

interface Options {
  homeDir?: string
  cacheMs?: number
  which?: (binary: string) => boolean
}

let cached: { at: number; status: WatchSetupStatus } | null = null

export function detectWatchSetup(opts: Options = {}): WatchSetupStatus {
  const cacheMs = opts.cacheMs ?? 5_000
  const homeDir = opts.homeDir ?? os.homedir()
  const which = opts.which ?? defaultWhich
  if (cached && Date.now() - cached.at < cacheMs) return cached.status
  const status: WatchSetupStatus = {
    ffmpeg: which('ffmpeg'),
    ytdlp: which('yt-dlp'),
    claudeCli: which('claude'),
    apiKeyKind: readApiKeyKind(homeDir),
  }
  cached = { at: Date.now(), status }
  return status
}

export function clearWatchSetupCache(): void {
  cached = null
}

function defaultWhich(binary: string): boolean {
  try {
    execFileSync('which', [binary], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function readApiKeyKind(homeDir: string): 'openai' | 'azure' | null {
  const file = path.join(homeDir, '.config', 'watch', '.env')
  try {
    const text = fs.readFileSync(file, 'utf-8')
    if (/^AZURE_OPENAI_API_KEY=.+/m.test(text)) return 'azure'
    if (/^OPENAI_API_KEY=.+/m.test(text)) return 'openai'
    return null
  } catch {
    return null
  }
}
