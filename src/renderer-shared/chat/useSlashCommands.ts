import { useState, useEffect } from 'react'

/**
 * Tracks the slash command/skill names Claude Code reports for a session. The
 * authoritative list arrives once in the `system/init` event at the start of a
 * run (broadcast as `agent:slash-commands`); we also fetch it on mount so the
 * `/` autocomplete works after navigating back to an already-initialized session.
 */
export function useSlashCommands(sessionId: string | null): string[] {
  const [commands, setCommands] = useState<string[]>([])

  useEffect(() => {
    if (!sessionId) {
      setCommands([])
      return
    }
    let cancelled = false
    window.electronAPI.invoke('simple:get-slash-commands', sessionId).then((value) => {
      if (cancelled) return
      if (Array.isArray(value) && value.length > 0) setCommands(value as string[])
    })

    const unsub = window.electronAPI.on('agent:slash-commands', (event: unknown) => {
      const e = event as { sessionId: string; commands: string[] }
      if (e.sessionId === sessionId) setCommands(e.commands)
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [sessionId])

  return commands
}
