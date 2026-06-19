/// <reference lib="dom" />
// Webview-side data source: state arrives from host `init` messages; the Refresh
// button posts back to the host. Replaces the renderer useVerdicts hook + dock state.
import { useEffect, useRef, useState } from 'react'
import type { VerdictRecord } from 'manifold'
import type { HostMsg } from '../protocol'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

export interface StatisticsState {
  records: VerdictRecord[]
  projectId: string | null
  error: string | null
  /** False until the first host `init` arrives (used to gate the loading state). */
  loaded: boolean
  /** True between a refresh()/initial request and the next host `init`. */
  refreshing: boolean
}

export interface StatisticsBridge extends StatisticsState {
  refresh: () => void
}

const EMPTY_STATE: StatisticsState = { records: [], projectId: null, error: null, loaded: false, refreshing: true }

function postToHost(msg: { type: 'ready' | 'refresh' }): void { parent.postMessage(msg, '*') }

export function useStatisticsBridge(): StatisticsBridge {
  const [state, setState] = useState<StatisticsState>(EMPTY_STATE)
  // Keep `refreshing` truthful across re-renders without re-subscribing the listener.
  const refreshingRef = useRef(true)

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'init') {
        refreshingRef.current = false
        setState({ records: m.records, projectId: m.projectId, error: m.error ?? null, loaded: true, refreshing: false })
      }
    }
    window.addEventListener('message', onMessage)
    postToHost({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return {
    ...state,
    refresh: () => {
      if (refreshingRef.current) return
      refreshingRef.current = true
      setState((s) => ({ ...s, refreshing: true }))
      postToHost({ type: 'refresh' })
    },
  }
}
