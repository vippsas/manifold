import { spawn } from 'node:child_process'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

export interface InstallProgress {
  onLog?: (line: string) => void
}

export interface InstallResult {
  installed: string[]
  alreadyPresent: string[]
  errors: Array<{ binary: string; message: string }>
}

const BREW_FORMULAE: Record<string, string> = {
  ffmpeg: 'ffmpeg',
}

export async function hasBinary(name: string): Promise<boolean> {
  try {
    await execFileP('which', [name], { timeout: 2000 })
    return true
  } catch {
    return false
  }
}

export async function hasBrew(): Promise<boolean> {
  return hasBinary('brew')
}

export async function ensureBinaries(
  required: string[],
  progress: InstallProgress = {},
): Promise<InstallResult> {
  const result: InstallResult = { installed: [], alreadyPresent: [], errors: [] }
  const missing: string[] = []
  for (const name of required) {
    if (await hasBinary(name)) {
      result.alreadyPresent.push(name)
    } else {
      missing.push(name)
    }
  }
  if (missing.length === 0) return result

  if (!(await hasBrew())) {
    for (const name of missing) {
      result.errors.push({
        binary: name,
        message: `${name} is missing and Homebrew is not installed. Install Homebrew (https://brew.sh) and re-run.`,
      })
    }
    return result
  }

  for (const name of missing) {
    const formula = BREW_FORMULAE[name.replace(/-/g, '_')] ?? name
    progress.onLog?.(`[watch] installing ${formula} via brew…`)
    try {
      await runStreamed('brew', ['install', formula], progress.onLog)
      result.installed.push(name)
    } catch (err) {
      result.errors.push({
        binary: name,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}

function runStreamed(
  command: string,
  args: string[],
  onLog?: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const handle = (chunk: Buffer): void => {
      if (!onLog) return
      for (const line of chunk.toString('utf-8').split(/\r?\n/)) {
        if (line.trim()) onLog(line)
      }
    }
    proc.stdout?.on('data', handle)
    proc.stderr?.on('data', handle)
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}
