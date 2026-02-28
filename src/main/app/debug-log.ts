import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEBUG_LOG = join(homedir(), '.manifold', 'debug.log')

export function debugLog(msg: string): void {
  try { appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`) } catch { /* */ }
}
