interface ElectronAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  send(channel: string, ...args: unknown[]): void
  on(channel: string, callback: (...args: unknown[]) => void): () => void
  getPathForFile(file: File): string
  /** The user's home directory, captured once at preload time. The real bridge
   *  always sets it; optional so test stubs of the surface need not carry it,
   *  which also keeps every reader handling its absence. */
  homeDir?: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
