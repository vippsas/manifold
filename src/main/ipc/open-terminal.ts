import { spawn as defaultSpawn, type ChildProcess } from 'node:child_process'

type SpawnLike = typeof defaultSpawn

// After the process starts, wait this long for an immediate non-zero exit before
// treating the launch as successful. `x-terminal-emulator` is a Debian
// alternatives symlink and `--working-directory` is a GNOME-family option, so a
// target such as xterm exits non-zero right away; without this window that
// failure would be reported as success and no window would appear.
const LAUNCH_GRACE_MS = 300

export function openTerminal(
  directory: string,
  platform: NodeJS.Platform = process.platform,
  spawn: SpawnLike = defaultSpawn,
  graceMs: number = LAUNCH_GRACE_MS,
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
    let settled = false
    const succeed = (): void => {
      if (settled) return
      settled = true
      clearTimeout(graceTimer)
      child.unref()
      resolve()
    }
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(graceTimer)
      reject(error)
    }

    // A foreground terminal (e.g. xterm) never exits, so success is "still
    // running after the grace window". A client/server terminal (e.g.
    // gnome-terminal) hands off and exits 0, handled below.
    const graceTimer = setTimeout(succeed, graceMs)
    graceTimer.unref?.()

    child.once('error', (error) => fail(new Error('Failed to open terminal', { cause: error })))
    child.once('exit', (code) => {
      if (code === 0 || code === null) succeed()
      else fail(new Error(`Failed to open terminal: '${command}' exited with code ${code} (does it support --working-directory?)`))
    })
  })
}
