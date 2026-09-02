// Screenshot fixture for ViolaRunBoard — see scripts/screenshot-component.mjs.
// `npm run screenshot:component ViolaRunBoard --theme manifold-dark` renders a live four-task
// run covering every in-flight state at once, which is what the design has to hold up under.
import React from 'react'
import type { ViolaRun } from '../../../shared/viola'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { ViolaRunBoard } from './ViolaRunBoard'

const now = Date.now()

const run: ViolaRun = {
  id: 'viola-1',
  baseSessionId: 'viola-1',
  goal: 'Split the settings panel and cover it with tests',
  summary: 'Four independent tasks',
  state: 'running',
  availableRuntimes: ['claude', 'codex', 'copilot'],
  createdAt: now - 22 * 60_000,
  tasks: [
    {
      id: 'settings-split', title: 'settings-split', description: 'd', acceptance: ['a'],
      purpose: 'implement', gates: ['npm test -- src/settings'],
      state: 'implementing', stateSince: now - 14 * 60_000 - 12_000,
      runtimeId: 'claude', sessionId: 'child-1',
    },
    {
      id: 'token-audit', title: 'token-audit', description: 'd', acceptance: ['a'],
      purpose: 'explore', gates: [],
      state: 'exploring', stateSince: now - 47_000,
      runtimeId: 'copilot', sessionId: 'child-2',
    },
    {
      id: 'theme-contrast', title: 'theme-contrast', description: 'd', acceptance: ['a'],
      purpose: 'implement', gates: ['npm run typecheck'],
      state: 'reviewing', stateSince: now - 3 * 60_000,
      runtimeId: 'codex', reviewRuntimeId: 'claude', sessionId: 'child-3',
    },
    {
      id: 'dock-restore', title: 'dock-restore', description: 'd', acceptance: ['a'],
      purpose: 'implement', gates: ['npm test -- src/renderer/hooks'],
      state: 'fixing', stateSince: now - 68_000,
      runtimeId: 'claude', reviewRuntimeId: 'codex', sessionId: 'child-4',
      review: { passed: false, blocking: ['Restore drops the remembered active panel.'], nonBlocking: [] },
    },
  ],
}

export default function ViolaRunBoardFixture(): React.JSX.Element {
  return (
    <div style={{ width: 720, padding: 24, background: 'var(--bg-primary)' }}>
      <DockStateContext.Provider value={{ onOpenSibling: () => {} } as never}>
        <ViolaRunBoard run={run} />
      </DockStateContext.Provider>
    </div>
  )
}
