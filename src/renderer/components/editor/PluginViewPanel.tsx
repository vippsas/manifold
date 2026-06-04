import React, { useEffect, useRef, useState } from 'react'

/** Renders a plugin-contributed view as a sandboxed iframe. The panel id IS the
 *  plugin view id; main resolves the owning plugin. */
export function PluginViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [version, setVersion] = useState(0)
  const loadedRef = useRef(false)
  const pendingRef = useRef<unknown[]>([])

  const post = (msg: unknown): void => {
    const w = iframeRef.current?.contentWindow
    if (loadedRef.current && w) w.postMessage(msg, '*')
    else pendingRef.current.push(msg)
  }

  useEffect(() => {
    const offHtml = window.electronAPI.on('plugins:webview-html', (id: unknown, v: unknown) => {
      if (id === viewId) { loadedRef.current = false; setVersion(v as number) }
    })
    const offMsg = window.electronAPI.on('plugins:webview-message', (id: unknown, msg: unknown) => {
      if (id === viewId) post(msg)
    })
    void window.electronAPI.invoke('plugins:open-view', viewId)
    return () => { offHtml(); offMsg() }
  }, [viewId])

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source && e.source === iframeRef.current?.contentWindow) {
        void window.electronAPI.invoke('plugins:webview-to-host', viewId, e.data)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [viewId])

  const onLoad = (): void => {
    loadedRef.current = true
    const w = iframeRef.current?.contentWindow
    if (w) { for (const m of pendingRef.current) w.postMessage(m, '*'); pendingRef.current = [] }
  }

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      src={version > 0 ? `manifold-webview://view/${encodeURIComponent(viewId)}?v=${version}` : 'about:blank'}
      onLoad={onLoad}
      title={viewId}
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
    />
  )
}
