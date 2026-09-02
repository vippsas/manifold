import { execFile } from 'node:child_process'
import { AgentRuntime } from '../../shared/types'

export const VIOLA_WORKER_RUNTIME_IDS = ['claude', 'codex', 'copilot', 'gemini'] as const

export const BUILT_IN_RUNTIMES: readonly AgentRuntime[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binary: 'claude',
    args: ['--allow-dangerously-skip-permissions'],
    aiModelArgs: ['--model', 'haiku'],
    waitingPattern: '❯|waiting for input|Interrupt to stop'
  },
  {
    id: 'codex',
    name: 'Codex',
    binary: 'codex',
    args: [],
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
    id: 'viola',
    name: 'Viola',
    binary: '',
    kind: 'orchestrator',
    waitingPattern: 'native-orchestrator'
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
  const cliResults = await Promise.all(
    BUILT_IN_RUNTIMES
      .filter((runtime) => runtime.kind !== 'orchestrator')
      .map(async (runtime) => ({
        ...runtime,
        installed: await checkBinaryExists(runtime.binary),
      }))
  )
  const availableWorkers = cliResults.filter((runtime) => (
    runtime.installed && VIOLA_WORKER_RUNTIME_IDS.includes(runtime.id as typeof VIOLA_WORKER_RUNTIME_IDS[number])
  )).length
  return BUILT_IN_RUNTIMES.map((runtime) => {
    if (runtime.kind === 'orchestrator') {
      return { ...runtime, installed: availableWorkers >= 2 }
    }
    return cliResults.find((candidate) => candidate.id === runtime.id)!
  })
}
