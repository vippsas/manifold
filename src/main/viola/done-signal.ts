import { access, rm } from 'node:fs/promises'
import { join } from 'node:path'

export type ViolaDoneOutcome = 'done' | 'timeout' | 'aborted'

export interface ViolaDoneWaitOptions {
  signal: AbortSignal
  timeoutMs: number
}

/**
 * How Viola learns that a worker's turn is actually over.
 *
 * The alternative is reading the worker's terminal, and that cannot be made reliable: a TUI keeps
 * its prompt glyph on screen while it works, so "looks idle" is true almost immediately, and a
 * worker that simply pauses — a long tool call, model latency — gets declared finished. Viola then
 * diffs an untouched tree and reports "no diff to review" while the worker is still typing.
 *
 * A file the worker writes as its last action is unambiguous. Each turn clears it first, so a turn
 * can never inherit the previous turn's completion.
 */
export interface ViolaDoneSignal {
  /** The marker a worker writes when it has finished a turn that produces no other artifact. */
  donePath(worktreePath: string): string
  clear(path: string): Promise<void>
  wait(path: string, options: ViolaDoneWaitOptions): Promise<ViolaDoneOutcome>
}

const DEFAULT_POLL_MS = 2_000

export function createViolaDoneSignal(options: { pollMs?: number } = {}): ViolaDoneSignal {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS

  return {
    // One worker owns one worktree, so its own tree is a unique place to signal from.
    donePath: (worktreePath) => join(worktreePath, '.viola', 'done'),
    async clear(path) {
      await rm(path, { force: true })
    },
    async wait(target, { signal, timeoutMs }) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        if (signal.aborted) return 'aborted'
        if (await exists(target)) return 'done'
        if (Date.now() >= deadline) return 'timeout'
        await sleep(Math.min(pollMs, Math.max(1, deadline - Date.now())))
      }
    },
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref?.()
  })
}
