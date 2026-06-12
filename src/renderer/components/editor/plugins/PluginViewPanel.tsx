import React, { useEffect, useRef, useState } from 'react'
import { useDockState } from '../editor-shell/dock-panel-types'
import { PLUGIN_WEBVIEW_THEME_VARS, readThemeVars } from './plugin-theme-vars'

/** Renders a plugin-contributed view as a sandboxed iframe. The panel id IS the
 *  plugin view id; main resolves the owning plugin. */
export function PluginViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const { theme } = useDockState()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [version, setVersion] = useState(0)
  const loadedRef = useRef(false)
  const pendingRef = useRef<unknown[]>([])

  const post = (msg: unknown): void => {
    const w = iframeRef.current?.contentWindow
    if (loadedRef.current && w) w.postMessage(msg, '*')
    else pendingRef.current.push(msg)
  }

  // Plugin webviews are sandboxed and can't read the parent's computed theme; inject the
  // live CSS-variable values so plugin UIs match the active Manifold theme (re-sent on change).
  const postTheme = (): void => {
    const styles = getComputedStyle(document.documentElement)
    post({ type: '__manifold_theme', vars: readThemeVars((n) => styles.getPropertyValue(n), PLUGIN_WEBVIEW_THEME_VARS) })
  }

  useEffect(() => { postTheme() }, [theme]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const offHtml = window.electronAPI.on('plugins:webview-html', (id: unknown, v: unknown) => {
      if (id === viewId) { loadedRef.current = false; setVersion(v as number) }
    })
    const offMsg = window.electronAPI.on('plugins:webview-message', (id: unknown, msg: unknown) => {
      if (id === viewId) post(msg)
    })
    void window.electronAPI.invoke('plugins:open-view', viewId).catch((err: unknown) => {
      // Activation failure would otherwise be an unhandled rejection. No
      // renderer toast API exists for arbitrary errors, so log it.
      // eslint-disable-next-line no-console
      console.error(`[PluginViewPanel] failed to open view "${viewId}":`, err)
    })
    return () => { offHtml(); offMsg() }
  }, [viewId])

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source && e.source === iframeRef.current?.contentWindow) {
        // The webview posts 'ready' once its own message listener is attached. The theme
        // sent in onLoad can race that listener (postMessage isn't buffered), leaving the UI
        // on fallback colors; re-send it here, now that we know the webview is listening.
        if ((e.data as { type?: unknown } | null)?.type === 'ready') postTheme()
        void window.electronAPI.invoke('plugins:webview-to-host', viewId, e.data).catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error(`[PluginViewPanel] webview-to-host failed for "${viewId}":`, err)
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [viewId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onLoad = (): void => {
    if (version === 0) return // about:blank — not the real content; keep buffering
    loadedRef.current = true
    const w = iframeRef.current?.contentWindow
    if (w) for (const m of pendingRef.current) w.postMessage(m, '*')
    pendingRef.current = []
    postTheme()
  }

  return (
    <iframe
      ref={iframeRef}
      // allow-same-origin: sandbox flags propagate to nested browsing
      // contexts, so without it a frameSources-admitted embed (e.g. the watch
      // YouTube player) runs from an opaque origin and black-screens. Script
      // isolation rests on the served nonce CSP (connect-src 'none'), not on
      // this flag; the webview origin is manifold-webview://view, which never
      // matches the parent renderer's origin.
      sandbox="allow-scripts allow-same-origin"
      src={version > 0 ? `manifold-webview://view/${encodeURIComponent(viewId)}?v=${version}` : 'about:blank'}
      onLoad={onLoad}
      title={viewId}
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
    />
  )
}
