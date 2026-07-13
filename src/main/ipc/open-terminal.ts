import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process'

type SpawnLike = typeof defaultSpawn

export function openTerminal(
  directory: string,
  platform: NodeJS.Platform = process.platform,
  spawn: SpawnLike = defaultSpawn,
): Promise<void> {
  let command: string
  let args: string[]

  if (platform === 'darwin') {
    command = 'open'
    args = ['-a', 'Terminal', directory]
  } else if (platform === 'linux') {
    command = 'x-terminal-emulator'
    args = ['--working-directory', directory]
  } else {
    return Promise.reject(new Error(`Opening a terminal is not supported on ${platform}`))
  }

  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
    child.once('error', (error) => {
      reject(new Error('Failed to open terminal', { cause: error }))
    })
  })
}
