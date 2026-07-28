// Screenshot fixture for the code viewer's empty state — what the files item's
// Editor tab shows before any file is chosen. The viewer is a standing tab, so
// this is a state the user can reach at any time, not a transient one. Not used
// by the app at runtime; `npm run screenshot:component CodeViewer`.
import React from 'react'
import { CodeViewer } from './CodeViewer'

export default (
  <div style={{ width: 520, height: 320, background: 'var(--bg-primary)' }}>
    <CodeViewer
      sessionId="fixture-session"
      fileDiffText={null}
      originalContent={null}
      openFiles={[]}
      activeFilePath={null}
      fileContent={null}
      lastFileOpenRequest={{ path: null, source: 'default' }}
      theme="manifold-dark"
      onSelectTab={() => {}}
      onCloseTab={() => {}}
    />
  </div>
)
