import React, { useEffect, useRef, useState } from 'react'

/** Renders a plugin-contributed view as a sandboxed iframe. The panel id IS the
 *  plugin view id; main resolves the owning plugin. */
export function PluginViewPanel({ api }: { api: { id: string } }): React.JSX.Element {
  const viewId = api.id
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [html, setHtml] = useState('')

  useEffect(() => {
    const offHtml = window.electronAPI.on('plugins:webview-html', (id: unknown, h: unknown) => {
      if (id === viewId) setHtml(h as string)
    })
    const offMsg = window.electronAPI.on('plugins:webview-message', (id: unknown, msg: unknown) => {
      if (id === viewId) iframeRef.current?.contentWindow?.postMessage(msg, '*')
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

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      srcDoc={html}
      title={viewId}
      style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
    />
  )
}
