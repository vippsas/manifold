import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createCommandHandlers, type CommandContext } from '../../commands/command-handlers'

export interface UseCommandsResult {
  /** Run a command by id — used by the native menu (via IPC) and the palette. */
  runCommand: (id: string) => void
}

/**
 * Central command dispatcher. Builds the id → handler map from the catalog and
 * subscribes to the single `command:run` IPC channel the native menu fires. The
 * command palette calls `runCommand` directly. Unknown ids no-op with a warning
 * so a main/renderer catalog skew across an update can't crash the renderer.
 */
export function useCommands(context: CommandContext): UseCommandsResult {
  const handlersRef = useRef<Record<string, () => void>>({})
  handlersRef.current = useMemo(() => createCommandHandlers(context), [context])

  const runCommand = useCallback((id: string): void => {
    const handler = handlersRef.current[id]
    if (!handler) {
      console.warn(`[useCommands] no handler for command: ${id}`)
      return
    }
    handler()
  }, [])

  useEffect(() => window.electronAPI.on('command:run', (id: unknown) => {
    if (typeof id === 'string') runCommand(id)
  }), [runCommand])

  return useMemo(() => ({ runCommand }), [runCommand])
}
