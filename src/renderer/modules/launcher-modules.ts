import type { DockPanelId } from '../hooks/dock-layout-helpers'

/** A module that can be opened on demand from the tab-strip "+" launcher.
 *  Adding a future module to the launcher means adding one entry here —
 *  the label is sourced from PANEL_TITLES so titles stay in one place. */
export interface LauncherModule {
  id: DockPanelId
  description: string
}

export const LAUNCHER_MODULES: readonly LauncherModule[] = [
  { id: 'backgroundAgent', description: 'Experimental project ideas feed.' },
  { id: 'loop', description: 'Autoresearch loop: edit → eval → keep-or-discard.' },
  { id: 'verdicts', description: 'Per-runtime quality metrics and recent sessions.' },
  { id: 'watch', description: 'Analyze a video with its transcript and extracted frames.' },
]

export const LAUNCHER_MODULE_IDS: ReadonlySet<DockPanelId> = new Set(
  LAUNCHER_MODULES.map((m) => m.id),
)
