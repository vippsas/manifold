import React from 'react'
import { CodeViewer } from './CodeViewer'

const file = {
  path: 'manifold-untitled:/Git Sync Output.txt',
  content: [
    'Repository: /Users/example/projects/manifold',
    '',
    '$ git pull --ff-only',
    'Already up to date.',
    '',
    '$ git push',
    'git push failed (code 1): remote rejected the push',
  ].join('\n'),
  refreshVersion: 0,
  transient: true,
}

export default (
  <div style={{ width: 900, height: 540 }}>
    <CodeViewer
      sessionId="fixture-session"
      fileDiffText={null}
      originalContent={null}
      openFiles={[file]}
      activeFilePath={file.path}
      fileContent={file.content}
      lastFileOpenRequest={{ path: file.path, source: 'default' }}
      theme="vs-dark"
      onSelectTab={() => undefined}
      onCloseTab={() => undefined}
      onSaveFile={() => undefined}
    />
  </div>
)
