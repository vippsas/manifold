import type { AgentRuntime } from '../../shared/types'
import { getRuntimeById } from '../agent/runtimes'
import type { BackgroundAgentRuntimeContext } from '../../../background-agent/schemas/background-agent-types'
import type { BackgroundAgentHostDeps } from './background-agent-types'

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
  const extraArgs = options.mode === 'research'
    ? getBackgroundAgentResearchModelArgs(resolved.runtime)
    : (resolved.runtime.aiModelArgs ?? [])
  return deps.gitOps.aiGenerate(
    resolved.runtime,
    options.prompt,
    resolved.cwd,
    extraArgs,
    { timeoutMs: options.timeoutMs },
  )
}

function getBackgroundAgentResearchModelArgs(runtime: AgentRuntime): string[] {
  switch (runtime.id) {
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
