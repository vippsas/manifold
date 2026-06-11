import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as https from 'node:https'
import { execFileSync } from 'node:child_process'

const BIN_DIR = path.join(os.homedir(), '.manifold', 'bin')
const BINARY_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
const RELEASE_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'

export interface FetchProgress {
  onLog?: (line: string) => void
}

export function getYtDlpPath(): string {
  return path.join(BIN_DIR, BINARY_NAME)
}

export function hasBundledYtDlp(): boolean {
  try {
    fs.accessSync(getYtDlpPath(), fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

let pending: Promise<string> | null = null

/**
 * Absolute path to a `yt-dlp` on PATH, or null. Prefer this: a brew/pip/pipx
 * yt-dlp is a Python script that starts in ~0.5s, whereas our bundled
 * `yt-dlp_macos` is a PyInstaller onefile that unpacks a full CPython on every
 * launch — a 13–21s cold start on macOS that alone can blow past peek's timeout.
 */
function findYtDlpOnPath(): string | null {
  const locate = process.platform === 'win32' ? 'where' : 'which'
  try {
    const found = execFileSync(locate, [BINARY_NAME], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .split('\n')[0]
      .trim()
    return found || null
  } catch {
    return null
  }
}

export async function ensureYtDlp(progress: FetchProgress = {}): Promise<string> {
  const onPath = findYtDlpOnPath()
  if (onPath) return onPath
  const target = getYtDlpPath()
  if (hasBundledYtDlp()) return target
  if (pending) return pending
  pending = downloadAndInstall(target, progress).finally(() => { pending = null })
  return pending
}

async function downloadAndInstall(target: string, progress: FetchProgress): Promise<string> {
  fs.mkdirSync(BIN_DIR, { recursive: true })
  const asset = pickAsset()
  const url = `${RELEASE_URL}/${asset}`
  const tempPath = `${target}.${process.pid}.tmp`
  progress.onLog?.(`[watch] downloading yt-dlp (${asset})…`)
  try {
    await streamDownload(url, tempPath, progress.onLog)
    if (process.platform !== 'win32') {
      fs.chmodSync(tempPath, 0o755)
    }
    fs.renameSync(tempPath, target)
    progress.onLog?.(`[watch] yt-dlp ready at ${target}`)
    return target
  } catch (err) {
    try { fs.unlinkSync(tempPath) } catch { /* ignore */ }
    throw err
  }
}

function pickAsset(): string {
  const plat = process.platform
  const arch = process.arch
  if (plat === 'darwin') return 'yt-dlp_macos'
  if (plat === 'win32') return 'yt-dlp.exe'
  if (plat === 'linux') {
    if (arch === 'arm64') return 'yt-dlp_linux_aarch64'
    if (arch === 'arm') return 'yt-dlp_linux_armv7l'
    return 'yt-dlp_linux'
  }
  throw new Error(`yt-dlp auto-install is not supported on ${plat}/${arch}`)
}

function streamDownload(
  url: string,
  dest: string,
  onLog?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const visit = (currentUrl: string, hops: number): void => {
      if (hops > 5) {
        reject(new Error('yt-dlp download: too many redirects'))
        return
      }
      const req = https.get(currentUrl, { headers: { 'user-agent': 'manifold-watch' } }, (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume()
          visit(res.headers.location, hops + 1)
          return
        }
        if (status !== 200) {
          res.resume()
          reject(new Error(`yt-dlp download failed: HTTP ${status}`))
          return
        }
        const total = Number(res.headers['content-length'] ?? 0)
        let received = 0
        let nextPct = 25
        const file = fs.createWriteStream(dest)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (onLog && total > 0) {
            const pct = Math.floor((received / total) * 100)
            if (pct >= nextPct) {
              onLog(`[watch] yt-dlp download ${pct}%`)
              nextPct = pct + 25
            }
          }
        })
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
        file.on('error', (err) => {
          file.close()
          reject(err)
        })
      })
      req.on('error', reject)
      req.setTimeout(60_000, () => {
        req.destroy(new Error('yt-dlp download timed out'))
      })
    }
    visit(url, 0)
  })
}
