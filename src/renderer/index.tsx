import './monaco-setup'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import 'dockview/dist/styles/dockview.css'
import './styles/dockview-theme.css'
import './styles/theme.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element not found')
}

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
