import React from 'react'
import { GitSyncFailureDialog } from './GitSyncFailureDialog'

export default (
  <div style={{ width: '100%', height: '100%' }}>
    <GitSyncFailureDialog
      repoName="manifold"
      failure={{
        ok: false,
        failedCommand: 'pull',
        message: 'git pull failed (code 128): fatal: Not possible to fast-forward, aborting.',
        output: '$ git pull --ff-only\nfatal: Not possible to fast-forward, aborting.',
      }}
      onShowCommandOutput={() => undefined}
      onClose={() => undefined}
    />
  </div>
)
