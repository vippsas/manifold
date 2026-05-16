import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { WATCH_RUNS_ROOT } from './run-store'

const TEMP_ALLOWED_PREFIX = path.join(os.tmpdir(), 'manifold-watch-')
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png'])

export class FramePathError extends Error {}

export function readFrameAsDataUrl(framePath: string): string {
  const resolved = path.resolve(framePath)
  if (!isAllowedFramePath(resolved)) {
    throw new FramePathError(`Path outside Manifold watch workdir: ${resolved}`)
  }
  const ext = path.extname(resolved).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new FramePathError(`Unsupported frame extension: ${ext}`)
  }
  if (!fs.existsSync(resolved)) {
    throw new FramePathError(`Frame not found: ${resolved}`)
  }
  const data = fs.readFileSync(resolved)
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${data.toString('base64')}`
}

function isAllowedFramePath(resolved: string): boolean {
  const runsRoot = path.resolve(WATCH_RUNS_ROOT)
  return resolved.startsWith(TEMP_ALLOWED_PREFIX) ||
    resolved === runsRoot ||
    resolved.startsWith(runsRoot + path.sep)
}
