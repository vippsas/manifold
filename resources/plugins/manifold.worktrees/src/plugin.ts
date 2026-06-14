import type { ManifoldContext } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createWebviewHost } from './webview-host'

export function activate(context: ManifoldContext): void {
  const host = createWebviewHost({
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
    list: () => manifold.worktrees.list(),
    listBranches: () => manifold.worktrees.listMergedBranches(),
    deleteMergedBranch: (projectId, branch) => manifold.worktrees.deleteMergedBranch(projectId, branch),
    deleteAllMergedBranches: (projectId) => manifold.worktrees.deleteAllMergedBranches(projectId),
    confirmDeleteAll: async (repo, count) => {
      const action = `Delete ${count}`
      const choice = await manifold.window.showWarningMessage(
        `Delete all ${count} merged branches in "${repo}"? They are already merged into the base branch, so this is safe — but it can't be undone here.`,
        action,
      )
      return choice === action
    },
    activeProjectName: () => manifold.workspace.activeProject?.name ?? null,
  })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.worktrees.panel', host.provider))
  context.subscriptions.push(manifold.workspace.onDidChangeActiveProject(() => host.refresh()))
}

export function deactivate(): void {}
