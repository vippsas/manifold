import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/theme.css'

// Surface uncaught errors so blank screens show diagnostics instead of nothing
window.onerror = (_msg, _src, _line, _col, err) => {
  console.error('[simple-renderer] uncaught error:', err)
}
window.onunhandledrejection = (e) => {
  console.error('[simple-renderer] unhandled rejection:', e.reason)
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
