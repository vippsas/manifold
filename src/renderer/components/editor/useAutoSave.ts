import { useCallback, useEffect, useRef } from 'react'

const AUTO_SAVE_DEBOUNCE_MS = 500

interface UseAutoSaveResult {
  onChange: (value: string | undefined) => void
}

export function useAutoSave(
  activeFilePath: string | null,
  onSaveFile: ((filePath: string, content: string) => void) | undefined,
): UseAutoSaveResult {
  const saveRef = useRef(onSaveFile)
  const activeFilePathRef = useRef(activeFilePath)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ filePath: string; content: string } | null>(null)

  saveRef.current = onSaveFile
  activeFilePathRef.current = activeFilePath

  const flush = useCallback((): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    saveRef.current?.(pending.filePath, pending.content)
  }, [])

  const onChange = useCallback((value: string | undefined): void => {
    if (value === undefined) return
    const filePath = activeFilePathRef.current
    if (!filePath) return
    pendingRef.current = { filePath, content: value }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, AUTO_SAVE_DEBOUNCE_MS)
  }, [flush])

  // Flush pending save when the active file changes (tab switch) or on unmount.
  // The previous file's edits must land before the editor remounts on a new path.
  useEffect(() => {
    return () => {
      flush()
    }
  }, [activeFilePath, flush])

  return { onChange }
}
