// resources/plugins/manifold.watch/src/webview/index.tsx
// Watch webview entry: injects keyframes (the renderer's global CSS is absent
// here) and mounts the ported WatchPanel. State + actions flow through
// use-watch-bridge (postMessage).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { WatchPanel } from './components/WatchPanel'
import { WATCH_KEYFRAMES } from './keyframes'

const style = document.createElement('style')
style.textContent = WATCH_KEYFRAMES
document.head.appendChild(style)

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<WatchPanel />)
