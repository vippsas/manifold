import { AgentStatus } from '../../shared/types'
import { getRuntimeById } from './runtimes'

interface StatusPattern {
  pattern: RegExp
  status: AgentStatus
}

const COMMON_ERROR_PATTERNS: readonly StatusPattern[] = [
  { pattern: /error:|Error:|ERROR:|fatal:|FATAL:|panic:|PANIC:/, status: 'error' },
  { pattern: /Traceback \(most recent call last\)/, status: 'error' },
  { pattern: /command not found/, status: 'error' }
]

const RUNTIME_PATTERNS: Record<string, readonly StatusPattern[]> = {
  claude: [
    { pattern: /❯/, status: 'waiting' },
    { pattern: /waiting for input/i, status: 'waiting' },
    { pattern: /Do you want to proceed/i, status: 'waiting' },
    { pattern: /Allow|Deny|Yes|No.*\?/i, status: 'waiting' },
    { pattern: /Interrupt to stop/, status: 'running' }
  ],
  codex: [
    { pattern: /> $/, status: 'waiting' },
    { pattern: /codex>/i, status: 'waiting' }
  ],
  copilot: [
    { pattern: /> $/, status: 'waiting' },
    { pattern: /❯/, status: 'waiting' },
    { pattern: /Allow|Deny|Yes|No.*\?/i, status: 'waiting' }
  ],
  gemini: [
    { pattern: /❯/, status: 'waiting' },
    { pattern: />>> $/, status: 'waiting' }
  ]
}

function buildPatternsForRuntime(runtimeId: string): StatusPattern[] {
  const runtime = getRuntimeById(runtimeId)
  const patterns: StatusPattern[] = []

  // Add runtime-specific patterns
  const builtIn = RUNTIME_PATTERNS[runtimeId]
  if (builtIn) {
    patterns.push(...builtIn)
  }

  // Add custom pattern from runtime config
  if (runtime?.waitingPattern) {
    const parts = runtime.waitingPattern.split('|')
    for (const part of parts) {
      if (part.trim()) {
        patterns.push({
          pattern: new RegExp(escapeRegex(part.trim())),
          status: 'waiting'
        })
      }
    }
  }

  // Add common error patterns at lower priority
  patterns.push(...COMMON_ERROR_PATTERNS)

  return patterns
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function detectStatus(output: string, runtimeId: string): AgentStatus {
  // Only check the last few lines for status detection
  const recentOutput = output.slice(-2000)
  if (runtimeId === 'codex' && hasCodexInteractivePrompt(recentOutput)) {
    return 'waiting'
  }
  const patterns = buildPatternsForRuntime(runtimeId)

  for (const { pattern, status } of patterns) {
    if (pattern.test(recentOutput)) {
      return status
    }
  }

  // If there's output but no pattern matched, the agent is running
  if (recentOutput.trim().length > 0) {
    return 'running'
  }

  return 'running'
}

export function hasCodexInteractivePrompt(output: string, opts: { allowActiveMarker?: boolean } = {}): boolean {
  const normalized = stripTerminalControls(output).replace(/\r/g, '\n').trimEnd()
  const marker = normalized.lastIndexOf('›')
  if (marker === -1) return false

  const promptTail = normalized.slice(marker)
  if (!isCodexPromptBlock(promptTail, opts.allowActiveMarker ?? false)) return false

  return hasPriorCodexTurnActivity(normalized.slice(0, marker))
}

const CODEX_ACTIVE_MARKER = /[•·]\s*Working\b|esc to interrupt|Interrupt to stop/i
const CODEX_PROMPT_HINT = /gpt-[\w.-]+|\/model to change|~\/|\.manifold|\/skills to list available skills/i

function isCodexPromptBlock(value: string, allowActiveMarker: boolean): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('›')) return false
  if (!allowActiveMarker && CODEX_ACTIVE_MARKER.test(trimmed)) return false
  if (allowActiveMarker) {
    const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
    const activePromptLine = lines.some((line) =>
      CODEX_ACTIVE_MARKER.test(line) &&
      (line.startsWith('›') || CODEX_PROMPT_HINT.test(line))
    )
    if (activePromptLine) return false
  }
  return CODEX_PROMPT_HINT.test(trimmed)
}

function hasPriorCodexTurnActivity(value: string): boolean {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean)
  return lines.some((line) => !isCodexPromptFragment(line))
}

function isCodexPromptFragment(line: string): boolean {
  if (CODEX_ACTIVE_MARKER.test(line)) return false
  if (line.startsWith('›')) return true
  return CODEX_PROMPT_HINT.test(line)
}

function stripTerminalControls(value: string): string {
  return value
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}
