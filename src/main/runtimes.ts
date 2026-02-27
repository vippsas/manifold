import { execFile } from 'node:child_process'
import { AgentRuntime } from '../shared/types'

export const BUILT_IN_RUNTIMES: readonly AgentRuntime[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    args: ['--dangerously-skip-permissions'],
    aiModelArgs: ['--model', 'haiku'],
    waitingPattern: '❯|waiting for input|Interrupt to stop'
  },
  {
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    args: [],
    aiModelArgs: ['--model', 'o4-mini'],
    waitingPattern: '> |codex>'
  },
  {
    id: 'copilot',
    name: 'Copilot',
    binary: 'copilot',
    args: ['--yolo'],
    aiModelArgs: ['--model', 'claude-sonnet-4.5'],
    waitingPattern: '> |❯'
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    binary: 'gemini',
    args: [],
    aiModelArgs: ['--model', 'gemini-2.0-flash'],
    waitingPattern: '❯|>>> '
  },
  {
    id: 'ollama-claude',
    name: 'Claude Code (Ollama)',
    binary: 'ollama',
    args: ['launch', 'claude'],
    needsModel: true,
    waitingPattern: '❯|waiting for input|Interrupt to stop'
  },
  {
    id: 'ollama-codex',
    name: 'Codex (Ollama)',
    binary: 'ollama',
    args: ['launch', 'codex'],
    needsModel: true,
    waitingPattern: '> |codex>'
  }
] as const

export function getRuntimeById(id: string): AgentRuntime | undefined {
  return BUILT_IN_RUNTIMES.find((r) => r.id === id)
}

export function listRuntimes(): AgentRuntime[] {
  return [...BUILT_IN_RUNTIMES]
}

function checkBinaryExists(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [binary], (error) => {
      resolve(!error)
    })
  })
}

export async function listRuntimesWithStatus(): Promise<AgentRuntime[]> {
  const results = await Promise.all(
    BUILT_IN_RUNTIMES.map(async (rt) => ({
      ...rt,
      installed: await checkBinaryExists(rt.binary),
    }))
  )
  return results
}
