import { AgentStatus } from '../shared/types'
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
