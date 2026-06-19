// Statistics webview entry: mounts the ported dashboard. State + the active project
// flow through use-statistics-bridge (postMessage to the plugin host); theme CSS vars
// are injected by the renderer and applied in the bridge.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { StatisticsPanel } from './StatisticsPanel'

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<StatisticsPanel />)
