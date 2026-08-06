import type { ShellMode } from './shell-terminal-store'

/** What the dock header shows for the Shell panel: the +/chevron/kill pills.
 *  The terminal list is not here — it lives in the panel body, beside the
 *  terminals (`ShellTabs.tsx`). */
export interface ShellHeaderControls {
  canAddShell: boolean
  activeSessionId: string | null
  onCloseTerminal: (sessionId: string) => void
  onAddShell: (mode: ShellMode) => void
}

let currentControls: ShellHeaderControls | null = null
const listeners = new Set<() => void>()

function emitChange(): void {
  for (const listener of listeners) listener()
}

export function registerShellHeaderControls(controls: ShellHeaderControls): void {
  currentControls = controls
  emitChange()
}

export function unregisterShellHeaderControls(controls: ShellHeaderControls): void {
  if (currentControls === controls) {
    currentControls = null
    emitChange()
  }
}

export function getShellHeaderControls(): ShellHeaderControls | null {
  return currentControls
}

export function subscribeShellHeaderControls(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
