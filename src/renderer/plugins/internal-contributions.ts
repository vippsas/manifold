// src/renderer/plugins/internal-contributions.ts
import type React from 'react'
import type { PanelContribution } from '../../shared/plugins/contributions'

/** An internal (built-in) panel contribution: a PanelContribution plus the
 *  renderer component that draws it. Plugin contributions render via a webview
 *  instead and carry no component. */
export interface InternalPanel extends PanelContribution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>
}

/** Built-in launcher modules drawn by a local renderer component. Array order
 *  defines their order in the "+ Apps" menu. Now empty: Loop moved out to the
 *  manifold.loop plugin (Phase C), Watch to manifold.watch (Phase 3), and
 *  Verdicts to manifold.statistics (#750). The mechanism remains for any future
 *  built-in panel. */
export const INTERNAL_PANELS: InternalPanel[] = []
