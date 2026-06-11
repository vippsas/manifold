// resources/plugins/manifold.watch/src/plugin.ts
import type { ManifoldContext } from 'manifold'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifold = require('manifold') as typeof import('manifold')

import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createWebviewHost } from './webview-host'
import { createWatchFacade } from './facade'
import { installWatchSkills } from './skill-installer'
import { getBundledWatchSkillPath } from './resource-path'

export function activate(context: ManifoldContext): void {
  // Idempotent (fingerprint-checked); the skill must exist before the user's
  // agent is asked to run /watch:watch, and runs only start from this panel.
  try { installWatchSkills({ sourceDir: getBundledWatchSkillPath(context.pluginUri) }) }
  catch (err) { console.error('[watch-plugin] skill install failed:', err) }

  const facade = createWatchFacade(manifold)
  const host = createWebviewHost({
    facade,
    readBundle: () => readFileSync(join(context.pluginUri, 'out', 'webview.js'), 'utf8'),
  })
  context.subscriptions.push(manifold.window.registerWebviewViewProvider('manifold.watch.panel', host.provider))
  context.subscriptions.push(manifold.workspace.onDidChangeActiveSession(() => host.refresh()))
}

export function deactivate(): void {}
