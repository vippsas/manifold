import * as pty from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEBUG_LOG = join(homedir(), '.manifold', 'debug.log')
function debugLog(msg: string): void {
  try { appendFileSync(DEBUG_LOG, `${new Date().toISOString()} ${msg}\n`) } catch { /* */ }
}

export interface PtyHandle {
  id: string
  pid: number
}

interface PtyEntry {
  id: string
  process: pty.IPty
  dataListeners: Array<(data: string) => void>
  exitListeners: Array<(exitCode: number, signal?: number) => void>
}

export class PtyPool {
  private ptys: Map<string, PtyEntry> = new Map()

  spawn(
    file: string,
    args: string[],
    options: { cwd: string; env?: Record<string, string>; cols?: number; rows?: number }
  ): PtyHandle {
    const id = uuidv4()
    const env = { ...process.env, ...(options.env ?? {}) } as Record<string, string>
    // Manifold spawns agents as child PTY processes. If Manifold itself was
    // launched from inside Claude Code, the CLAUDECODE env var leaks through
    // and makes Claude Code refuse to start ("nested session" detection).
    delete env.CLAUDECODE

    debugLog(`[pty-pool] spawn file=${file} args=${JSON.stringify(args)} cwd=${options.cwd} cols=${options.cols} rows=${options.rows}`)
    debugLog(`[pty-pool] PATH=${env.PATH?.split(':').slice(0, 5).join(':')}...`)

    const proc = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd,
      env
    })

    debugLog(`[pty-pool] spawned pid=${proc.pid}`)

    const entry: PtyEntry = {
      id,
      process: proc,
      dataListeners: [],
      exitListeners: []
    }

    this.wireListeners(id, entry, proc)
    this.ptys.set(id, entry)

    return { id, pid: proc.pid }
  }

  private wireListeners(id: string, entry: PtyEntry, proc: pty.IPty): void {
    let dataReceived = false
    proc.onData((data: string) => {
      if (!dataReceived) {
        debugLog(`[pty-pool] first data from pid=${proc.pid} len=${data.length}`)
        dataReceived = true
      }
      for (const listener of entry.dataListeners) {
        listener(data)
      }
    })

    proc.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      debugLog(`[pty-pool] exit pid=${proc.pid} code=${exitCode} signal=${signal}`)
      for (const listener of entry.exitListeners) {
        listener(exitCode, signal)
      }
      this.ptys.delete(id)
    })
  }

  write(id: string, data: string): void {
    const entry = this.ptys.get(id)
    if (!entry) throw new Error(`PTY not found: ${id}`)
    entry.process.write(data)
  }

  kill(id: string): void {
    const entry = this.ptys.get(id)
    if (!entry) return
    entry.process.kill()
    this.ptys.delete(id)
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.ptys.get(id)
    if (!entry) throw new Error(`PTY not found: ${id}`)
    entry.process.resize(cols, rows)
  }

  onData(id: string, callback: (data: string) => void): void {
    const entry = this.ptys.get(id)
    if (!entry) throw new Error(`PTY not found: ${id}`)
    entry.dataListeners.push(callback)
  }

  onExit(id: string, callback: (exitCode: number, signal?: number) => void): void {
    const entry = this.ptys.get(id)
    if (!entry) throw new Error(`PTY not found: ${id}`)
    entry.exitListeners.push(callback)
  }

  killAll(): void {
    for (const [id] of this.ptys) {
      this.kill(id)
    }
  }

  getActivePtyIds(): string[] {
    return Array.from(this.ptys.keys())
  }
}
