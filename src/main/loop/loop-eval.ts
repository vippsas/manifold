import type { MetricDirection, MetricSpec } from '../../shared/loop-types'

export type ParseResult = { score: number } | { failure: string }

export function parseMetric(stdout: string, exitCode: number, spec: MetricSpec): ParseResult {
  if (spec.kind === 'exit-code') {
    return { score: exitCode === 0 ? 0 : 1 }
  }

  if (spec.kind === 'stdout-regex') {
    let regex: RegExp
    try {
      regex = new RegExp(spec.pattern, 'm')
    } catch (err) {
      return { failure: `invalid regex: ${(err as Error).message}` }
    }
    const match = stdout.match(regex)
    if (!match) return { failure: `no match for /${spec.pattern}/` }
    const captured = match[1]
    if (captured === undefined) return { failure: 'regex has no capture group 1' }
    const value = Number(captured)
    if (!Number.isFinite(value)) return { failure: `captured value "${captured}" is not a number` }
    return { score: value }
  }

  const jsonText = extractLastJsonBlock(stdout)
  if (jsonText === null) return { failure: 'could not find json in stdout' }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (err) {
    return { failure: `invalid json: ${(err as Error).message}` }
  }
  const value = resolveJsonPath(parsed, spec.path)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { failure: `value at path "${spec.path}" is not a number` }
  }
  return { score: value }
}

export function isImprovement(next: number, best: number | undefined, direction: MetricDirection): boolean {
  if (best === undefined) return true
  return direction === 'minimize' ? next < best : next > best
}

function resolveJsonPath(root: unknown, path: string): unknown {
  const segments = path.split('.')
  let current: unknown = root
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function extractLastJsonBlock(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed

  const lines = stdout.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line.startsWith('{') || line.startsWith('[')) return line
  }
  return null
}
