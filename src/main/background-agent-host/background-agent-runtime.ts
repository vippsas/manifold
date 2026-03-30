import type { AgentRuntime } from '../../shared/types'
import { getRuntimeById } from '../agent/runtimes'
import type { BackgroundAgentRuntimeContext } from '../../../background-agent/schemas/background-agent-types'
import type { BackgroundAgentHostDeps } from './background-agent-types'
import { debugLog } from '../app/debug-log'

interface ResolvedBackgroundAgentRuntime {
  runtimeId: string
  runtime: AgentRuntime
  cwd: string
  context: BackgroundAgentRuntimeContext
}

interface RunBackgroundAgentPromptOptions {
  prompt: string
  projectId: string
  activeSessionId: string | null
  timeoutMs?: number
  mode?: 'default' | 'research'
  silent?: boolean
  logLabel?: string
}

export function resolveBackgroundAgentRuntime(
  deps: Pick<BackgroundAgentHostDeps, 'settingsStore' | 'projectRegistry' | 'sessionManager'>,
  projectId: string,
  activeSessionId: string | null,
): ResolvedBackgroundAgentRuntime {
  const project = deps.projectRegistry.getProject(projectId)
  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const settings = deps.settingsStore.getSettings()
  const activeSession = deps.sessionManager.getSession(activeSessionId ?? '')
  const runtimeId = activeSession?.runtimeId ?? settings.defaultRuntime
  const runtime = getRuntimeById(runtimeId)

  if (!runtime) {
    throw new Error(`Background agent runtime not found: ${runtimeId}`)
  }

  const cwd = activeSession?.worktreePath ?? project.path
  return {
    runtimeId,
    runtime,
    cwd,
    context: {
      activeSessionId,
      runtimeId,
      worktreePath: cwd,
      mode: 'non-interactive',
    },
  }
}

export async function runBackgroundAgentPrompt(
  deps: Pick<BackgroundAgentHostDeps, 'settingsStore' | 'projectRegistry' | 'sessionManager' | 'gitOps'>,
  options: RunBackgroundAgentPromptOptions,
): Promise<string> {
  const resolved = resolveBackgroundAgentRuntime(deps, options.projectId, options.activeSessionId)
  const timeoutMs = getBackgroundAgentTimeoutMs(resolved.runtime, options.mode, options.timeoutMs)
  const extraArgs = options.mode === 'research'
    ? getBackgroundAgentResearchModelArgs(resolved.runtime)
    : (resolved.runtime.aiModelArgs ?? [])
  const label = options.logLabel ?? 'prompt'
  debugLog(
    `[background-agent] runtime start project=${options.projectId} runtime=${resolved.runtime.id} mode=${options.mode ?? 'default'} label=${label} timeoutMs=${timeoutMs ?? 'default'}`,
  )
  try {
    const output = await deps.gitOps.aiGenerate(
      resolved.runtime,
      options.prompt,
      resolved.cwd,
      extraArgs,
      {
        timeoutMs,
        silent: options.silent,
      },
    )
    debugLog(
      `[background-agent] runtime success project=${options.projectId} runtime=${resolved.runtime.id} label=${label} outputLength=${output.trim().length}`,
    )
    return output
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    debugLog(
      `[background-agent] runtime failure project=${options.projectId} runtime=${resolved.runtime.id} label=${label} error=${sanitizeForLog(message)}`,
    )
    throw error
  }
}

function getBackgroundAgentTimeoutMs(
  runtime: AgentRuntime,
  mode: RunBackgroundAgentPromptOptions['mode'],
  requestedTimeoutMs?: number,
): number | undefined {
  if (mode !== 'research') {
    return requestedTimeoutMs
  }

  const minimumResearchTimeoutMs = runtime.id === 'codex'
    ? 180_000
    : 90_000

  return Math.max(requestedTimeoutMs ?? minimumResearchTimeoutMs, minimumResearchTimeoutMs)
}

function getBackgroundAgentResearchModelArgs(runtime: AgentRuntime): string[] {
  switch (runtime.id) {
    case 'codex':
      return ['--search']
    case 'claude':
      return ['--model', 'sonnet']
    case 'gemini':
      return ['--model', 'gemini-2.5-pro']
    case 'copilot':
      return ['--model', 'claude-sonnet-4.5']
    case 'ollama-claude':
    case 'ollama-codex':
      return runtime.aiModelArgs ?? []
    default:
      return runtime.aiModelArgs ?? []
  }
}

function sanitizeForLog(value: string, maxLength = 220): string {
  const singleLine = value.replace(/\s+/g, ' ').trim()
  if (singleLine.length <= maxLength) return singleLine
  return `${singleLine.slice(0, maxLength - 1).trimEnd()}…`
}
