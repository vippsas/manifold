import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { debugLog } from './debug-log'

/**
 * Electron on macOS doesn't inherit the user's shell PATH.
 * Resolve it once at startup by asking the login shell.
 * IMPORTANT: Do NOT source .zshrc here — it's for interactive shells and
 * hangs/timeouts when launched from Spotlight with no TTY.
 */
export function loadShellPath(): void {
  if (process.platform !== 'darwin') return
  try {
    const shell = process.env.SHELL ?? '/bin/zsh'
    const output = execFileSync(shell, ['-l', '-c', 'echo $PATH'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    // Take the last non-empty line in case profile scripts printed anything
    const shellPath = output.split('\n').reverse().find((l) => l.trim().length > 0)?.trim()
    if (shellPath) {
      process.env.PATH = shellPath
      debugLog(`[startup] PATH resolved (${shellPath.split(':').length} entries), includes .local/bin: ${shellPath.includes('.local/bin')}`)
    } else {
      debugLog('[startup] loadShellPath: no PATH found in shell output')
    }
  } catch (err) {
    debugLog(`[startup] loadShellPath failed: ${err}`)
  }

  // Ensure well-known binary directories are in PATH even if shell resolution
  // was incomplete or failed (common when launched from Spotlight/Finder).
  const home = homedir()
  const commonDirs = [
    join(home, '.local', 'bin'),      // npm global installs (claude)
    '/opt/homebrew/bin',               // Homebrew ARM (codex, git, node)
    '/opt/homebrew/sbin',              // Homebrew system tools
    '/usr/local/bin',                  // Homebrew Intel / system tools
  ]
  const currentPath = process.env.PATH ?? ''
  const pathSet = new Set(currentPath.split(':'))
  const missing = commonDirs.filter(d => !pathSet.has(d))
  if (missing.length > 0) {
    process.env.PATH = currentPath + ':' + missing.join(':')
    debugLog(`[startup] appended ${missing.length} common dirs to PATH: ${missing.join(', ')}`)
  }
}
