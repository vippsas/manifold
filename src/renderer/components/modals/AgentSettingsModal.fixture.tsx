import React from 'react'
import { AgentSettingsModal } from './AgentSettingsModal'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import type { DockAppState } from '../editor/editor-shell/dock-panel-types'
import { registerPanelContribution } from '../../plugins/contribution-registry'

// Register a launcher contribution so the fixture shows the Apps section
// (per-worktree apps, listed only for the active session).
registerPanelContribution({
  id: 'manifold.statistics.panel',
  title: 'Statistics',
  description: 'Cost and usage statistics for this agent.',
  launcher: true,
  source: 'plugin',
  kind: 'webview',
})

const dockState = {
  sessionId: 'session-1',
  onOpenModule: () => undefined,
  onOpenPluginView: () => undefined,
  onOpenPluginTreeView: () => undefined,
  isModuleOpen: () => false,
} as unknown as DockAppState

export default (
  <DockStateContext.Provider value={dockState}>
    {/* The modal portals to document.body; the div keeps the screenshot
        harness's root-mounted check satisfied. */}
    <div style={{ minHeight: 1 }} />
    <AgentSettingsModal
      visible
      session={{
        id: 'session-1',
        projectId: 'storefront',
        runtimeId: 'codex',
        branchName: 'checkout/payment-flow',
        worktreePath: '/worktrees/payment-flow',
        status: 'running',
        pid: 42,
        displayName: 'Payment flow',
        additionalDirs: ['/worktrees/commerce-api'],
      }}
      fallbackName="Payment flow"
      onSave={() => undefined}
      onClose={() => undefined}
    />
  </DockStateContext.Provider>
)
