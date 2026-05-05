import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
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

const MARKETPLACE = 'claude-video'
const PLUGIN_NAME = 'watch'
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE}`
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
  const sourceFingerprint = `${sourceVersion}+${hashSourceTree(opts.sourceDir)}`
  installClaudeCodePlugin(opts.sourceDir, homeDir, sourceVersion, sourceFingerprint, result)

  if (hasCodex) {
    const codexTarget = path.join(homeDir, '.codex', 'skills', PLUGIN_NAME)
    installFolder(opts.sourceDir, codexTarget, sourceFingerprint, result)
  }

  return result
}

function installClaudeCodePlugin(
  sourceDir: string,
  homeDir: string,
  version: string,
  fingerprint: string,
  result: InstallResult,
): void {
  const installPath = path.join(homeDir, '.claude', 'plugins', 'cache', MARKETPLACE, PLUGIN_NAME, version)
  installFolder(sourceDir, installPath, fingerprint, result)
  if (result.errors.some((e) => e.startsWith(installPath))) return

  try {
    upsertInstalledPluginsRegistry(homeDir, installPath, version)
    upsertEnabledPlugin(homeDir)
  } catch (err) {
    result.errors.push(`registry update: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function installFolder(
  sourceDir: string,
  target: string,
  fingerprint: string,
  result: InstallResult,
): void {
  try {
    const installedFingerprint = readMarker(target)
    if (installedFingerprint && installedFingerprint === fingerprint) {
      result.skipped.push(target)
      return
    }
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    copyRecursive(sourceDir, target)
    fs.writeFileSync(path.join(target, VERSION_MARKER), fingerprint)
    result.installed.push(target)
  } catch (err) {
    result.errors.push(`${target}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Stable content hash over the source tree so any patch to the bundled skill
// (e.g. SKILL.md) re-installs even when plugin.json version is unchanged.
function hashSourceTree(sourceDir: string): string {
  const hash = crypto.createHash('sha256')
  const entries: string[] = []
  walk(sourceDir, sourceDir, entries)
  entries.sort()
  for (const rel of entries) {
    hash.update(rel)
    hash.update('\0')
    hash.update(fs.readFileSync(path.join(sourceDir, rel)))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 16)
}

function walk(rootDir: string, dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === VERSION_MARKER) continue
    const sp = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(rootDir, sp, out)
    else if (entry.isFile()) out.push(path.relative(rootDir, sp))
  }
}

interface InstalledPluginEntry {
  scope: 'user' | 'project'
  installPath: string
  version: string
  installedAt: string
  lastUpdated: string
  projectPath?: string
  gitCommitSha?: string
}

interface InstalledPluginsRegistry {
  version: number
  plugins: Record<string, InstalledPluginEntry[]>
}

function upsertInstalledPluginsRegistry(homeDir: string, installPath: string, version: string): void {
  const registryPath = path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })

  let registry: InstalledPluginsRegistry
  try {
    const raw = fs.readFileSync(registryPath, 'utf-8')
    registry = JSON.parse(raw) as InstalledPluginsRegistry
    if (!registry.plugins || typeof registry.plugins !== 'object') {
      registry = { version: 2, plugins: {} }
    }
  } catch {
    registry = { version: 2, plugins: {} }
  }

  const existing = registry.plugins[PLUGIN_KEY] ?? []
  const userIdx = existing.findIndex((entry) => entry.scope === 'user')
  const now = new Date().toISOString()
  const entry: InstalledPluginEntry = {
    scope: 'user',
    installPath,
    version,
    installedAt: userIdx >= 0 ? existing[userIdx].installedAt : now,
    lastUpdated: now,
  }
  if (userIdx >= 0) existing[userIdx] = entry
  else existing.push(entry)
  registry.plugins[PLUGIN_KEY] = existing

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8')
}

function upsertEnabledPlugin(homeDir: string): void {
  const settingsPath = path.join(homeDir, '.claude', 'settings.json')
  let settings: Record<string, unknown> = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>
  } catch {
    // settings.json may not exist yet; we'll create it.
  }
  const enabled = (settings.enabledPlugins as Record<string, boolean> | undefined) ?? {}
  if (enabled[PLUGIN_KEY] === true) return
  enabled[PLUGIN_KEY] = true
  settings.enabledPlugins = enabled
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
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
