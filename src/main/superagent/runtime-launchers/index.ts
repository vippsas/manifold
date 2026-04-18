import { claudeLauncher } from './claude-launcher'
import { codexLauncher } from './codex-launcher'
import { copilotLauncher } from './copilot-launcher'
import { geminiLauncher } from './gemini-launcher'
import type { OrchestratorLauncher } from './types'

export type { OrchestratorLauncher, OrchestratorLaunchContext, OrchestratorLaunchSpec } from './types'

const LAUNCHERS: Record<string, OrchestratorLauncher> = {
  claude: claudeLauncher,
  'ollama-claude': claudeLauncher,
  codex: codexLauncher,
  copilot: copilotLauncher,
  gemini: geminiLauncher,
}

export function getOrchestratorLauncher(runtimeId: string): OrchestratorLauncher | undefined {
  return LAUNCHERS[runtimeId]
}
