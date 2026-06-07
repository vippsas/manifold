import type { ExtraShell, ShellMode } from './shell-tabs-hooks'

export interface ShellHeaderControls {
  activeTab: string
  canAddShell: boolean
  extraShells: ExtraShell[]
  onSetActiveTab: (tab: string) => void
  onRemoveShell: (id: string) => void
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
