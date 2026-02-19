import { useState, useCallback, useEffect, useRef } from 'react'

interface UseIpcInvokeResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  invoke: (...args: unknown[]) => Promise<T | null>
}

export function useIpcInvoke<T>(channel: string): UseIpcInvokeResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const invoke = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setLoading(true)
      setError(null)
      try {
        const result = (await window.electronAPI.invoke(channel, ...args)) as T
        if (mountedRef.current) {
          setData(result)
          setLoading(false)
        }
        return result
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (mountedRef.current) {
          setError(message)
          setLoading(false)
        }
        return null
      }
    },
    [channel]
  )

  return { data, loading, error, invoke }
}

export function useIpcListener<T = unknown>(
  channel: string,
  handler: (payload: T) => void
): void {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const callback = (...args: unknown[]): void => {
      handlerRef.current(args[0] as T)
    }
    window.electronAPI.on(channel, callback)
    return () => {
      window.electronAPI.off(channel, callback)
    }
  }, [channel])
}
