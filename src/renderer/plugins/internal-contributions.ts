// src/renderer/plugins/internal-contributions.ts
import type React from 'react'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { PANEL_TITLES } from '../hooks/dock-layout/dock-layout-helpers'
import { VerdictsPanel } from '../components/verdicts/VerdictsPanel'

/** An internal (built-in) panel contribution: a PanelContribution plus the
 *  renderer component that draws it. Plugin contributions (Phase 1) render via a
 *  webview instead and carry no component. */
export interface InternalPanel extends PanelContribution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>
}

/** The built-in modules formerly hardcoded in launcher-modules.ts and
 *  dock-panels.tsx. Array order defines their order in the "+ Apps" menu.
 *  Titles are sourced from PANEL_TITLES so titles stay in one place.
 *  (Loop moved out to the manifold.loop plugin in Phase C; Watch to the
 *  manifold.watch plugin in Phase 3; the Ideas feed was removed.) */
export const INTERNAL_PANELS: InternalPanel[] = [
  {
    id: 'verdicts',
    title: PANEL_TITLES.verdicts,
    description: 'Per-runtime quality metrics and recent sessions.',
    launcher: true,
    source: 'internal',
    component: VerdictsPanel,
  },
]
