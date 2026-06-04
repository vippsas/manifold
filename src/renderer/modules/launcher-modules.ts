// src/renderer/modules/launcher-modules.ts
import type { DockPanelId } from '../hooks/dock-layout-helpers'
import { getLauncherContributions } from '../plugins/contribution-registry'

/** A module that can be opened on demand from the tab-strip "+" launcher.
 *  Sourced from the contribution registry — built-in modules are registered as
 *  internal contributions in src/renderer/plugins/internal-contributions.ts. */
export interface LauncherModule {
  id: DockPanelId
  description: string
}

export const LAUNCHER_MODULES: readonly LauncherModule[] = getLauncherContributions()
  .map((c) => ({ id: c.id as DockPanelId, description: c.description }))

export const LAUNCHER_MODULE_IDS: ReadonlySet<DockPanelId> = new Set(
  LAUNCHER_MODULES.map((m) => m.id),
)
