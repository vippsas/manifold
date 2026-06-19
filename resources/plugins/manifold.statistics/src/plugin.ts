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
  })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.statistics.panel', host.provider))
  // Re-read when the user switches project so newly captured sessions show up.
  context.subscriptions.push(manifold.workspace.onDidChangeActiveProject(() => host.refresh()))
}

export function deactivate(): void {}
