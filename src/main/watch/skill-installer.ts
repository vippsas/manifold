import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFileSync } from 'node:child_process'

export interface InstallOptions {
  sourceDir: string
  homeDir?: string
  hasCodex?: boolean
}

export interface InstallResult {
  installed: string[]
  skipped: string[]
  errors: string[]
}

const VERSION_MARKER = '.manifold-version'

export function installWatchSkills(opts: InstallOptions): InstallResult {
  const homeDir = opts.homeDir ?? os.homedir()
  const hasCodex = opts.hasCodex ?? detectCodex()
  const result: InstallResult = { installed: [], skipped: [], errors: [] }

  if (!fs.existsSync(opts.sourceDir)) {
    result.errors.push(`source missing: ${opts.sourceDir}`)
    return result
  }

  const sourceVersion = readSourceVersion(opts.sourceDir)
  const targets: string[] = [path.join(homeDir, '.claude', 'plugins', 'watch')]
  if (hasCodex) targets.push(path.join(homeDir, '.codex', 'skills', 'watch'))

  for (const target of targets) {
    try {
      const installedVersion = readMarker(target)
      if (installedVersion && installedVersion === sourceVersion) {
        result.skipped.push(target)
        continue
      }
      fs.rmSync(target, { recursive: true, force: true })
      fs.mkdirSync(target, { recursive: true })
      copyRecursive(opts.sourceDir, target)
      fs.writeFileSync(path.join(target, VERSION_MARKER), sourceVersion)
      result.installed.push(target)
    } catch (err) {
      result.errors.push(`${target}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}

function readSourceVersion(sourceDir: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(sourceDir, 'plugin.json'), 'utf-8')) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function readMarker(target: string): string | null {
  try {
    return fs.readFileSync(path.join(target, VERSION_MARKER), 'utf-8').trim()
  } catch {
    return null
  }
}

function copyRecursive(src: string, dst: string): void {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name)
    const dp = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(dp, { recursive: true })
      copyRecursive(sp, dp)
    } else if (entry.isFile()) {
      fs.copyFileSync(sp, dp)
    }
  }
}

function detectCodex(): boolean {
  try {
    execFileSync('which', ['codex'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}
