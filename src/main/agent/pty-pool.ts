import * as pty from 'node-pty'
import { v4 as uuidv4 } from 'uuid'
import { debugLog } from '../app/debug-log'

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

// Grace period after the default kill signal before escalating to SIGKILL. A
// child that traps/ignores SIGHUP (or an orphaned grandchild of `npm run dev`)
// would otherwise survive as a zombie with no remaining handle to it. (#502)
const SIGKILL_GRACE_MS = 2000

export class PtyPool {
  private ptys: Map<string, PtyEntry> = new Map()
  // Processes that were sent the default kill signal but have not yet reported
  // exit. The handle is retained here (after the entry leaves `ptys`) only long
  // enough to escalate to SIGKILL if the grace period elapses. (#502)
  private pendingKills: Map<string, { process: pty.IPty; timer: ReturnType<typeof setTimeout> }> = new Map()

  spawn(
    file: string,
    args: string[],
    options: { cwd: string; env?: Record<string, string>; cols?: number; rows?: number }
  ): PtyHandle {
    const id = uuidv4()
    const env = {
      ...process.env,
      // Advertise color capability the way a real terminal (e.g. iTerm2) does.
      // The PTY runs xterm-256color and xterm.js renders truecolor, but tools
      // like Claude Code (chalk/Ink via supports-color) only emit color when the
      // environment says the terminal supports it. Without these, color
      // detection depends on the host's inherited env and silently collapses to
      // a single foreground color on some machines. (#395)
      COLORTERM: 'truecolor',
      FORCE_COLOR: '3',
      ...(options.env ?? {}),
    } as Record<string, string>
    // Manifold spawns agents as child PTY processes. If Manifold itself was
    // launched from inside Claude Code, the CLAUDECODE env var leaks through
    // and makes Claude Code refuse to start ("nested session" detection).
    delete env.CLAUDECODE
    // An inherited NO_COLOR would suppress all ANSI output, undoing the color
    // capability we just advertised. Strip it so Manifold's themed terminal
    // stays colored regardless of the host shell's preference. (#395)
    delete env.NO_COLOR

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
      const pending = this.pendingKills.get(id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingKills.delete(id)
      }
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

  /** Inject text into the terminal output stream without sending it to the PTY process. */
  pushOutput(id: string, data: string): void {
    const entry = this.ptys.get(id)
    if (!entry) return
    for (const listener of entry.dataListeners) {
      listener(data)
    }
  }

  kill(id: string): void {
    const entry = this.ptys.get(id)
    if (!entry) return
    // Send the default termination signal first, then drop the entry from the
    // active map. We keep the process handle in `pendingKills` until onExit
    // fires; if the child traps/ignores the signal and is still alive after the
    // grace period, escalate to SIGKILL so it can't linger as a zombie. (#502)
    const proc = entry.process
    this.ptys.delete(id)
    proc.kill()
    const timer = setTimeout(() => {
      // Still pending means onExit never fired — force-kill it.
      if (this.pendingKills.has(id)) {
        this.pendingKills.delete(id)
        try {
          proc.kill('SIGKILL')
        } catch {
          // Process may have exited between the check and the signal.
        }
      }
    }, SIGKILL_GRACE_MS)
    timer.unref?.()
    this.pendingKills.set(id, { process: proc, timer })
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
