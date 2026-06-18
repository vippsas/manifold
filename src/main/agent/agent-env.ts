import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

/**
 * Default location of the agent env file. Matches the homedir()/.manifold
 * convention used by the other simple stores (view-state-store, dock-layout-store,
 * debug-log).
 */
export function agentEnvFilePath(): string {
  return path.join(os.homedir(), '.manifold', 'agent.env')
}

/**
 * Parse dotenv-style `KEY=VALUE` lines. Skips blank lines and `#` comments,
 * splits on the first `=`, trims surrounding whitespace, and strips one
 * surrounding pair of single or double quotes. Mirrors load-env.sh's stripping.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue // no '=' or empty key
    const key = line.slice(0, eq).trim()
    if (!key) continue
    result[key] = stripQuotes(line.slice(eq + 1).trim())
  }
  return result
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1)
    }
  }
  return value
}

/**
 * Read and parse the agent env file. Returns {} if the file is absent or
 * unreadable. Never logs values.
 */
export function loadAgentEnv(filePath: string = agentEnvFilePath()): Record<string, string> {
  let contents: string
  try {
    contents = fs.readFileSync(filePath, 'utf8')
  } catch {
    return {}
  }
  return parseEnvFile(contents)
}

/**
 * Build the env to merge into an agent PTY spawn: the agent env file overlaid by
 * any runtime-specific env. Returns undefined when there is nothing to inject,
 * preserving the prior `env: undefined` behavior so spawns are unchanged when no
 * agent.env exists.
 */
export function agentSpawnEnv(
  runtimeEnv?: Record<string, string>,
  filePath?: string,
): Record<string, string> | undefined {
  const merged = { ...loadAgentEnv(filePath), ...(runtimeEnv ?? {}) }
  return Object.keys(merged).length > 0 ? merged : undefined
}
