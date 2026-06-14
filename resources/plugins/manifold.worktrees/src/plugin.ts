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
    listBranches: () => manifold.worktrees.listBranches(),
  })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.worktrees.panel', host.provider))
}

export function deactivate(): void {}
