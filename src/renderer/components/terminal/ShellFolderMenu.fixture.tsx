// Screenshot fixture for the new-terminal folder picker.
// `npm run screenshot:component ShellFolderMenu`.
//
// Shown with the real worktree paths a grouped workspace produces: they share a
// long home prefix and differ only near the tail, which is what the row's
// start-ellipsis is for.
import React from 'react'
import { ShellFolderMenu } from './ShellFolderMenu'
import type { ShellFolder } from './shell-cwd'

const folders: ShellFolder[] = [
  { projectId: 'p1', name: 'ai-playground-cleanup', path: '/Users/you/.manifold/worktrees/ai-playground-cleanup/manifold-playground' },
  { projectId: 'p2', name: 'vce-infra', path: '/Users/you/.manifold/worktrees/vce-infra/manifold-playground' },
  { projectId: 'p3', name: 'ai-playground-docs', path: '/Users/you/projects/ai-playground-docs' },
]

export default function ShellFolderMenuFixture(): React.JSX.Element {
  return (
    <div style={{ width: 420, height: 220, position: 'relative', background: 'var(--bg-primary)' }}>
      <ShellFolderMenu
        folders={folders}
        anchor={{ top: 24, left: 24 }}
        onPick={() => {}}
        onClose={() => {}}
      />
    </div>
  )
}
