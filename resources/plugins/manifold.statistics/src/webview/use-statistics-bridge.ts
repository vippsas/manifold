/// <reference lib="dom" />
// Webview-side data source: state arrives from host `init` messages; the Refresh
// button posts back to the host. All-projects view — records grouped by repo.
import { useEffect, useRef, useState } from 'react'
import type { ProjectVerdicts, VerdictRecord, VerifyPullRequestsResult } from 'manifold'
import type { HostMsg } from '../protocol'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

export interface StatisticsState {
  groups: ProjectVerdicts[]
  error: string | null
  /** False until the first host `init` arrives (used to gate the loading state). */
  loaded: boolean
  /** True between a refresh()/initial request and the next host `init`. */
  refreshing: boolean
  /** True between verifyPullRequests() and the next host `init`. */
  verifying: boolean
  verifyResult: VerifyPullRequestsResult | null
}

export interface StatisticsBridge extends StatisticsState {
  refresh: () => void
  /** Ask the host to open a PR URL in the browser (the webview is sandboxed). */
  openExternal: (url: string) => void
  /** Ask the host to confirm and delete one repo's captured sessions. */
  reset: (projectId: string) => void
  /** Ask the host to verify all captured open PRs. */
  verifyPullRequests: () => void
}

const EMPTY_STATE: StatisticsState = { groups: [], error: null, loaded: false, refreshing: true, verifying: false, verifyResult: null }

function postToHost(msg: { type: 'ready' | 'refresh' | 'verify-prs' } | { type: 'open-external'; url: string } | { type: 'reset'; projectId: string }): void { parent.postMessage(msg, '*') }

export function useStatisticsBridge(): StatisticsBridge {
  const [state, setState] = useState<StatisticsState>(EMPTY_STATE)
  // Keep `refreshing` truthful across re-renders without re-subscribing the listener.
  const refreshingRef = useRef(true)
  const verifyingRef = useRef(false)
  const autoVerifiedRef = useRef(false)

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
        const hasVerifyResult = Object.prototype.hasOwnProperty.call(m, 'verifyResult')
        const shouldAutoVerify = !autoVerifiedRef.current && !m.verifyResult && hasVerifiablePrs(m.groups)
        if (shouldAutoVerify) autoVerifiedRef.current = true
        verifyingRef.current = shouldAutoVerify
        setState((current) => ({
          groups: m.groups,
          error: m.error ?? null,
          loaded: true,
          refreshing: false,
          verifying: shouldAutoVerify,
          verifyResult: hasVerifyResult ? m.verifyResult ?? null : current.verifyResult,
        }))
        if (shouldAutoVerify) postToHost({ type: 'verify-prs' })
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
    openExternal: (url: string) => postToHost({ type: 'open-external', url }),
    reset: (projectId: string) => postToHost({ type: 'reset', projectId }),
    verifyPullRequests: () => {
      if (verifyingRef.current) return
      verifyingRef.current = true
      setState((s) => ({ ...s, verifying: true }))
      postToHost({ type: 'verify-prs' })
    },
  }
}

function hasVerifiablePrs(groups: ProjectVerdicts[]): boolean {
  return groups.some((group) => group.records.some((record: VerdictRecord) => record.outcome === 'pr_created' && Boolean(record.metrics.prUrl)))
}
