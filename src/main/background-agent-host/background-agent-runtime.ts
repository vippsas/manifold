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
  return deps.gitOps.aiGenerate(
    resolved.runtime,
    options.prompt,
    resolved.cwd,
    resolved.runtime.aiModelArgs ?? [],
    { timeoutMs: options.timeoutMs },
  )
}
