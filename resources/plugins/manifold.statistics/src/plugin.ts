import type { ManifoldContext } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createWebviewHost } from './webview-host'

export function activate(context: ManifoldContext): void {
  const host = createWebviewHost({
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
    listAll: () => manifold.verdicts.listAll(),
    openExternal: (url) => { void manifold.window.openExternal(url) },
    confirmReset: async (projectId) => {
      const group = (await manifold.verdicts.listAll()).find((g) => g.projectId === projectId)
      const name = group?.projectName ?? 'this repo'
      const count = group?.records.length ?? 0
      const choice = await manifold.window.showWarningMessage(
        `Delete all ${count} captured session${count === 1 ? '' : 's'} for ${name}? This can't be undone.`,
        'Delete', 'Cancel',
      )
      return choice === 'Delete'
    },
    clearProject: (projectId) => manifold.verdicts.clearProject(projectId),
  })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.statistics.panel', host.provider))
  // Re-read when the user switches project so newly captured sessions show up.
  context.subscriptions.push(manifold.workspace.onDidChangeActiveProject(() => host.refresh()))
}

export function deactivate(): void {}
