// Screenshot fixture for the agent tab's cost coin and its tooltip.
// `npm run screenshot:component AgentTabUsage`.
//
// Three real dock tabs, each a Claude session whose usage read returns a
// different shape: a fully priced session, one whose model has no published
// price, and one that has not recorded a turn yet. Tabs are wrapped in the same
// mock dockview elements DockTab.fixture uses so the coin sits where it really
// sits. Every row is at rest: the coin and the `…` must both be visible without
// a hover, and the Codex tab beside each must show no coin at all.
//
// The bubbles only appear once something hovers a coin — see
// scripts/ in docs/architecture/renderer-verification.md for driving it.
import React from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import 'dockview/dist/styles/dockview.css'
import '../styles/dockview-theme.css'
import { DockTab } from '../DockTab'
import { DockStateContext } from './editor/editor-shell/dock-panel-types'
import type { DockAppState } from './editor/editor-shell/dock-panel-types'
import { siblingPanelId } from '../hooks/agent-session/agent-siblings'
import type { SessionCostSummary } from '../../shared/types'

// Real numbers from transcript d15e6bb9 (Sonnet 5, /model, Haiku 4.5): two typed
// prompts, two requests. Note that the rounded cells do not visibly reconcile —
// 22,823 + 16,738 shows as 22.8k + 16.7k but totals 39.6k — which is what the
// Total row is for.
const PRICED: SessionCostSummary = {
  tokenUsage: { inputTokens: 12, outputTokens: 138, cacheReadTokens: 39_561, cacheCreationTokens: 39_062 },
  turns: 2,
  costUsd: 0.1299084,
  contextTokens: 33_454,
  unpricedModels: [],
  byModel: [
    { model: 'Sonnet 5', inputTokens: 2, outputTokens: 26, cacheReadTokens: 22_823, cacheWriteTokens: 22_356, costUsd: 0.0942526 },
    { model: 'Haiku 4.5', inputTokens: 10, outputTokens: 112, cacheReadTokens: 16_738, cacheWriteTokens: 16_706, costUsd: 0.0356558 },
  ],
}
const UNPRICED: SessionCostSummary = {
  tokenUsage: { inputTokens: 12_000, outputTokens: 4_300, cacheReadTokens: 88_000, cacheCreationTokens: 9_000 },
  turns: 6,
  costUsd: null,
  contextTokens: 31_500,
  unpricedModels: ['claude-mystery-9'],
  byModel: [
    { model: 'claude-mystery-9', inputTokens: 12_000, outputTokens: 4_300, cacheReadTokens: 88_000, cacheWriteTokens: 9_000, costUsd: null },
  ],
}

const USAGE: Record<string, SessionCostSummary | null> = {
  primary: PRICED,
  'child-1': UNPRICED,
  'child-2': null,
}

;(window as unknown as { electronAPI: { invoke: (c: string, id: string) => Promise<unknown> } }).electronAPI = {
  invoke: (_channel: string, sessionId: string) => Promise.resolve(USAGE[sessionId] ?? null),
}

function headerProps(id: string, title: string): IDockviewPanelHeaderProps {
  return {
    api: { id, title, onDidTitleChange: () => ({ dispose: () => {} }) },
  } as unknown as IDockviewPanelHeaderProps
}

const session = (id: string, displayName: string, runtimeId: string): unknown => ({
  id, projectId: 'p1', runtimeId, branchName: `manifold/${id}`, worktreePath: `/wt/${id}`,
  status: 'running', pid: 1, additionalDirs: [], displayName,
})

const state = {
  primarySessionId: 'primary',
  projects: [{ id: 'p1', name: 'Alpha', path: '/repos/alpha', baseBranch: 'main', addedAt: '2024-01-01' }],
  allProjectSessions: {
    p1: [
      session('primary', 'Priced', 'claude'),
      session('child-1', 'Unpriced', 'claude'),
      session('child-2', 'No usage', 'claude'),
      session('child-3', 'Codex', 'codex'),
    ],
  },
  onRenameAgent: () => {},
  onToggleLocked: () => {},
  onRequestDeleteAgent: () => {},
  onToggleMaximize: () => {},
  onClosePanel: () => {},
} as unknown as DockAppState

const tabWrap: React.CSSProperties = { display: 'flex', alignItems: 'center' }
const card: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)', overflow: 'hidden', width: 560,
  background: 'var(--bg-primary)', marginBottom: 96,
}

/** One mock dock group holding a single tab, so each tooltip has room below it. */
function Row({ panelId, title }: { panelId: string; title: string }): React.JSX.Element {
  return (
    <div className="dv-groupview dv-active-group" style={card}>
      <div className="dv-tabs-and-actions-container">
        <div className="dv-tabs-container">
          <div className="dv-tab dv-active-tab" style={tabWrap}>
            <DockTab {...headerProps(panelId, title)} />
          </div>
          <div className="dv-tab" style={tabWrap}>
            <DockTab {...headerProps(siblingPanelId('child-3'), 'Codex')} />
          </div>
        </div>
      </div>
      <div style={{ height: 28 }} />
    </div>
  )
}

function Fixture(): React.JSX.Element {
  return (
    <div className="dockview-theme-dark dockview-theme-manifold">
      <DockStateContext.Provider value={state}>
        <div style={{ padding: 24, background: 'var(--dock-canvas)', minHeight: 520 }}>
          <Row panelId="agent" title="Priced" />
          <Row panelId={siblingPanelId('child-1')} title="Unpriced" />
          <Row panelId={siblingPanelId('child-2')} title="No usage" />
        </div>
      </DockStateContext.Provider>
    </div>
  )
}

export default <Fixture />
