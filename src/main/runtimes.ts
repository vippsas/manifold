import { AgentRuntime } from '../shared/types'

export const BUILT_IN_RUNTIMES: readonly AgentRuntime[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    args: ['--dangerously-skip-permissions'],
    waitingPattern: '❯|waiting for input|Interrupt to stop'
  },
  {
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    args: ['--quiet'],
    waitingPattern: '> |codex>'
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    binary: 'gemini',
    args: [],
    waitingPattern: '❯|>>> '
  }
] as const

export function getRuntimeById(id: string): AgentRuntime | undefined {
  return BUILT_IN_RUNTIMES.find((r) => r.id === id)
}

export function listRuntimes(): AgentRuntime[] {
  return [...BUILT_IN_RUNTIMES]
}
