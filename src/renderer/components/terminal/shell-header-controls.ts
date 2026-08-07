import type { ShellMode } from './shell-terminal-store'

/** What the dock header shows for the Shell panel: the +/chevron split button
 *  and a close (×) that hides the whole terminal view (the shell panel). The
 *  terminals stay alive in the store, so reopening the panel shows them again.
 *  Killing an individual terminal is a per-row trash in the list (`ShellTabs`). */
export interface ShellHeaderControls {
  canAddShell: boolean
  onAddShell: (mode: ShellMode) => void
  onHideTerminals: () => void
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
