// resources/plugins/manifold.loop/src/webview/index.tsx
// Loop webview entry: injects keyframes (the renderer's global CSS is absent here) and mounts
// the ported LoopPanel. State + actions flow through use-loop-bridge (postMessage).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { LoopPanel } from './components/LoopPanel'
import { LOOP_KEYFRAMES, LOOP_INPUT_RETICLE } from './keyframes'

const style = document.createElement('style')
style.textContent = LOOP_KEYFRAMES + LOOP_INPUT_RETICLE
document.head.appendChild(style)

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<LoopPanel />)
