import React from 'react'
import { createRoot } from 'react-dom/client'
import { WorktreesPanel } from './WorktreesPanel'

const rootEl = document.getElementById('root')
if (rootEl) createRoot(rootEl).render(<WorktreesPanel />)
