/// <reference lib="dom" />
// resources/plugins/manifold.loop/src/webview/use-loop-bridge.ts
// Webview-side replacement for the renderer useLoop hook: state from host messages,
// actions via parent.postMessage. restoreBest/improveWithAi are single-flight (UI disables
// the trigger while busy) so one pending resolver per kind suffices.
import { useEffect, useRef, useState } from 'react'
import type { LoopConfig } from '../types'
import type { HostMsg, WebviewMsg } from './protocol'
import { applyHostMsg, EMPTY_LOOP_STATE, type UiLoopState } from './loop-state'

interface ThemeMsg { type: '__manifold_theme'; vars: Record<string, string> }

export interface LoopBridge extends UiLoopState {
  start: (config: LoopConfig) => void
  stop: () => void
  saveConfig: (config: LoopConfig) => void
  clear: () => void
  restoreBest: () => Promise<{ sha: string }>
  improveWithAi: (draft: string, evalCommand: string, targetGlobs: string) => Promise<string>
}

function postToHost(msg: WebviewMsg): void { parent.postMessage(msg, '*') }

export function useLoopBridge(): LoopBridge {
  const [state, setState] = useState<UiLoopState>(EMPTY_LOOP_STATE)
  const restoreResolver = useRef<{ resolve: (v: { sha: string }) => void; reject: (e: Error) => void } | null>(null)
  const aiResolver = useRef<{ resolve: (v: string) => void; reject: (e: Error) => void } | null>(null)

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      const m = e.data as HostMsg | ThemeMsg | null
      if (!m || typeof m !== 'object') return
      if (m.type === '__manifold_theme') {
        for (const [k, v] of Object.entries(m.vars)) document.documentElement.style.setProperty(k, v)
        return
      }
      if (m.type === 'restoreResult') {
        if (m.ok && m.sha) restoreResolver.current?.resolve({ sha: m.sha })
        else restoreResolver.current?.reject(new Error(m.error ?? 'restore failed'))
        restoreResolver.current = null
        return
      }
      if (m.type === 'aiResult') {
        if (m.ok && m.text !== undefined) aiResolver.current?.resolve(m.text)
        else aiResolver.current?.reject(new Error(m.error ?? 'AI failed'))
        aiResolver.current = null
        return
      }
      setState((s) => applyHostMsg(s, m))
    }
    window.addEventListener('message', onMessage)
    postToHost({ type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return {
    ...state,
    start: (config) => { setState((s) => ({ ...s, status: { sessionId: config.sessionId, state: 'running', currentIteration: 0 }, iterations: [], config, startError: null })); postToHost({ type: 'start', config }) },
    stop: () => postToHost({ type: 'stop' }),
    saveConfig: (config) => { setState((s) => ({ ...s, config })); postToHost({ type: 'saveConfig', config }) },
    clear: () => postToHost({ type: 'clearRequest' }),
    restoreBest: () => new Promise<{ sha: string }>((resolve, reject) => { restoreResolver.current = { resolve, reject }; postToHost({ type: 'restoreBest' }) }),
    improveWithAi: (draft, evalCommand, targetGlobs) => new Promise<string>((resolve, reject) => { aiResolver.current = { resolve, reject }; postToHost({ type: 'improveWithAi', draft, evalCommand, targetGlobs }) }),
  }
}
