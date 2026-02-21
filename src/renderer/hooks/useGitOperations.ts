import { useState, useEffect, useCallback, useRef } from 'react'
import type { AheadBehind, PRContext } from '../../shared/types'

interface ConflictsEvent {
  sessionId: string
  conflicts: string[]
}

interface UseGitOperationsResult {
  aheadBehind: AheadBehind
  conflicts: string[]
  commit: (message: string) => Promise<void>
  aiGenerate: (prompt: string) => Promise<string>
  getPRContext: () => Promise<PRContext>
  resolveConflict: (filePath: string, resolvedContent: string) => Promise<void>
  refreshAheadBehind: () => Promise<void>
}

export function useGitOperations(
  sessionId: string | null
): UseGitOperationsResult {
  const [aheadBehind, setAheadBehind] = useState<AheadBehind>({ ahead: 0, behind: 0 })
  const [conflicts, setConflicts] = useState<string[]>([])
  const sessionRef = useRef(sessionId)
  sessionRef.current = sessionId

  const refreshAheadBehind = useCallback(async (): Promise<void> => {
    if (!sessionRef.current) return
    try {
      const result = await window.electronAPI.invoke('git:ahead-behind', sessionRef.current) as AheadBehind
      setAheadBehind(result)
    } catch {
      // Silently fail — session may not exist yet
    }
  }, [])

  const commit = useCallback(async (message: string): Promise<void> => {
    if (!sessionRef.current) throw new Error('No active session')
    await window.electronAPI.invoke('git:commit', sessionRef.current, message)
    await refreshAheadBehind()
  }, [refreshAheadBehind])

  const aiGenerate = useCallback(async (prompt: string): Promise<string> => {
    if (!sessionRef.current) return ''
    try {
      return await window.electronAPI.invoke('git:ai-generate', sessionRef.current, prompt) as string
    } catch {
      return ''
    }
  }, [])

  const getPRContext = useCallback(async (): Promise<PRContext> => {
    if (!sessionRef.current) return { commits: '', diffStat: '', diffPatch: '' }
    try {
      return await window.electronAPI.invoke('git:pr-context', sessionRef.current) as PRContext
    } catch {
      return { commits: '', diffStat: '', diffPatch: '' }
    }
  }, [])

  const resolveConflict = useCallback(async (filePath: string, resolvedContent: string): Promise<void> => {
    if (!sessionRef.current) throw new Error('No active session')
    await window.electronAPI.invoke('git:resolve-conflict', sessionRef.current, filePath, resolvedContent)
  }, [])

  // Subscribe to conflict push events
  useEffect(() => {
    const unsubscribe = window.electronAPI.on('agent:conflicts', (data: unknown) => {
      const { sessionId: sid, conflicts: c } = data as ConflictsEvent
      if (sid === sessionRef.current) {
        setConflicts(c)
      }
    })
    return unsubscribe
  }, [])

  // Refresh ahead/behind when session changes
  useEffect(() => {
    if (sessionId) {
      void refreshAheadBehind()
    } else {
      setAheadBehind({ ahead: 0, behind: 0 })
      setConflicts([])
    }
  }, [sessionId, refreshAheadBehind])

  return { aheadBehind, conflicts, commit, aiGenerate, getPRContext, resolveConflict, refreshAheadBehind }
}
