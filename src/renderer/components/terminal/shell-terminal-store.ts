export type ShellMode = 'manifold' | 'system'

export interface ShellTerminal {
  sessionId: string
  label: string
  mode: ShellMode
  /** The folder this one runs in. Usually the scope key, but a terminal in a
   *  multi-folder workspace can be opened in any member (`resolveShellFolders`),
   *  so the set stays keyed to the workspace while its tabs differ. */
  cwd: string
}

/** One terminal set, keyed by the workspace checkout path it runs in.
 *
 *  `state` sequences the async open: `'idle'` means nothing has tried yet,
 *  `'opening'` means a restore-or-create is in flight (and blocks a second one,
 *  including StrictMode's double-mount), `'ready'` means the set is settled —
 *  an empty `'ready'` scope is one the user deliberately emptied, and must not
 *  be repopulated. */
export interface ShellScope {
  terminals: ShellTerminal[]
  counter: number
  activeSessionId: string | null
  state: 'idle' | 'opening' | 'ready'
  /** Message from a failed open, read by the panel's error strip. */
  error: string | null
}

const EMPTY: ShellScope = Object.freeze({
  terminals: Object.freeze([]) as unknown as ShellTerminal[],
  counter: 1,
  activeSessionId: null,
  state: 'idle',
  error: null,
})

const scopes = new Map<string, ShellScope>()
const listeners = new Set<() => void>()

/** Snapshot for `useSyncExternalStore`: the stored object, or one shared frozen
 *  empty. Never build a fresh object here — an unstable snapshot loops React. */
export function getScope(cwd: string | null): ShellScope {
  if (!cwd) return EMPTY
  return scopes.get(cwd) ?? EMPTY
}

export function subscribeShellTerminals(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function entry(cwd: string): ShellScope {
  const existing = scopes.get(cwd)
  if (existing) return existing
  const created: ShellScope = {
    terminals: [], counter: 1, activeSessionId: null, state: 'idle', error: null,
  }
  scopes.set(cwd, created)
  return created
}

/** Replace the entry object (snapshot identity must change), persist if settled,
 *  then notify.
 *
 *  `persist: false` is for a failed open: the scope must still reach `'ready'`
 *  so the user can retry, but writing its empty terminal list would erase the
 *  saved tabs we failed to restore. */
function updateScope(
  cwd: string,
  patch: Partial<ShellScope>,
  options?: { persist?: boolean },
): void {
  const next: ShellScope = { ...entry(cwd), ...patch }
  scopes.set(cwd, next)
  if (next.state === 'ready' && options?.persist !== false) {
    void window.electronAPI.invoke('shell-tabs:set', cwd, {
      tabs: next.terminals.map((t) => ({ label: t.label, cwd: t.cwd, mode: t.mode })),
      counter: next.counter,
    }).catch(() => {})
  }
  emit()
}

let exitSubscribed = false

/** Arm the exit listener on first use, never at import time: tests install
 *  `window.electronAPI` in `beforeEach`, which runs after module evaluation, so
 *  a top-level subscribe would throw on import.
 *
 *  The flag is set *after* a successful subscribe — set it first and a throwing
 *  `on` would latch the module into "already subscribed" with no listener. */
function ensureExitSubscription(): void {
  if (exitSubscribed) return
  window.electronAPI.on('agent:exit', (...args: unknown[]) => {
    const { sessionId } = args[0] as { sessionId: string }
    for (const [cwd, scope] of scopes) {
      if (scope.terminals.some((t) => t.sessionId === sessionId)) {
        closeTerminal(cwd, sessionId, { kill: false })
      }
    }
  })
  exitSubscribed = true
}

export function label(mode: ShellMode, counter: number): string {
  return `${mode === 'system' ? 'System' : 'Manifold'} ${counter}`
}

/** Errors live on the scope, never in component state: the panel unmounts every
 *  time it is closed, so a component-held message would be lost on close and a
 *  component-held "dismissed" flag would reset on reopen — resurrecting an error
 *  the user already dismissed. A successful add clears it. */
export async function addTerminal(cwd: string, mode: ShellMode, folderCwd?: string): Promise<void> {
  ensureExitSubscription()
  const runIn = folderCwd ?? cwd
  try {
    const result = await window.electronAPI.invoke('shell:create', runIn, { mode }) as { sessionId: string }
    const current = entry(cwd)
    const terminal: ShellTerminal = {
      sessionId: result.sessionId,
      label: label(mode, current.counter),
      mode,
      cwd: runIn,
    }
    updateScope(cwd, {
      terminals: [...current.terminals, terminal],
      counter: current.counter + 1,
      activeSessionId: terminal.sessionId,
      error: null,
    })
  } catch (e) {
    updateScope(cwd, { error: e instanceof Error ? e.message : String(e) }, { persist: false })
  }
}

export function dismissScopeError(cwd: string): void {
  updateScope(cwd, { error: null }, { persist: false })
}

/** Close a terminal. `kill: false` is for a shell that already exited on its
 *  own (an `agent:exit` we're reacting to), where there is no PTY left to kill. */
export function closeTerminal(cwd: string, sessionId: string, options?: { kill?: boolean }): void {
  const current = entry(cwd)
  const index = current.terminals.findIndex((t) => t.sessionId === sessionId)
  if (index === -1) return
  if (options?.kill !== false) {
    void window.electronAPI.invoke('shell:kill', sessionId).catch(() => {})
  }
  const terminals = current.terminals.filter((t) => t.sessionId !== sessionId)
  const activeSessionId = current.activeSessionId === sessionId
    ? (terminals[index - 1] ?? terminals[index])?.sessionId ?? null
    : current.activeSessionId
  updateScope(cwd, { terminals, activeSessionId })
}

interface SavedShellState {
  /** `cwd` is absent on sets saved before terminals had folders of their own;
   *  those restore into the scope folder, which is where they ran. */
  tabs: { label: string; cwd?: string; mode?: ShellMode }[]
  counter: number
}

/** Populate a scope the first time the panel shows it: restore what was saved,
 *  or create one shell. Runs at most once per cwd per session.
 *
 *  Order is load-bearing — see the plan's Task 3 notes. In short: the `'opening'`
 *  marker is set before the first await (StrictMode double-mount safety), the
 *  guard tests `state`, never emptiness (a scope the user emptied stays empty),
 *  and `finally` always reaches `'ready'` (a failed spawn must not wedge the cwd). */
export async function openScope(cwd: string): Promise<void> {
  ensureExitSubscription()
  const current = entry(cwd)
  if (current.state !== 'idle') return
  scopes.set(cwd, { ...current, state: 'opening' })

  let openError: string | null = null
  try {
    const saved = await window.electronAPI.invoke('shell-tabs:get', cwd) as SavedShellState | null
    if (saved && saved.tabs.length > 0) {
      const terminals: ShellTerminal[] = []
      let lastFailure: string | null = null
      for (const tab of saved.tabs) {
        const mode: ShellMode = tab.mode === 'system' ? 'system' : 'manifold'
        const tabCwd = tab.cwd ?? cwd
        try {
          const result = await window.electronAPI.invoke('shell:create', tabCwd, { mode }) as { sessionId: string }
          terminals.push({ sessionId: result.sessionId, label: tab.label, mode, cwd: tabCwd })
        } catch (e) {
          // One dead tab shouldn't sink the restore — but all of them should.
          lastFailure = e instanceof Error ? e.message : String(e)
        }
      }
      if (terminals.length === 0) {
        // Every saved tab failed (a checkout that no longer exists, typically).
        // Report it, and let the `finally` skip the persist so we don't
        // overwrite the very tabs we just failed to restore.
        openError = lastFailure ?? 'Could not restore terminals'
        return
      }
      scopes.set(cwd, {
        ...entry(cwd),
        terminals,
        counter: saved.counter,
        activeSessionId: terminals[0]?.sessionId ?? null,
      })
      return
    }

    const result = await window.electronAPI.invoke('shell:create', cwd, { mode: 'manifold' }) as { sessionId: string }
    scopes.set(cwd, {
      ...entry(cwd),
      terminals: [{ sessionId: result.sessionId, label: label('manifold', 1), mode: 'manifold', cwd }],
      counter: 2,
      activeSessionId: result.sessionId,
    })
  } catch (e) {
    openError = e instanceof Error ? e.message : String(e)
  } finally {
    updateScope(cwd, { state: 'ready', error: openError }, { persist: openError === null })
  }
}

export function setActiveTerminal(cwd: string, sessionId: string): void {
  updateScope(cwd, { activeSessionId: sessionId })
}

/** Test-only: drop scope state between cases. Deliberately does *not* clear
 *  `listeners` — that would detach a live `useSyncExternalStore` subscription
 *  and leave a rendered component silently frozen. */
export function resetShellTerminalStore(): void {
  scopes.clear()
  exitSubscribed = false
}
