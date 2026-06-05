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

// TODO(phase-1): widen LauncherModule.id to `string` before any plugin contributes
// a launcher panel. The `as DockPanelId` cast is safe only while the sole launcher
// contributions are the four built-in modules (whose ids are valid DockPanelIds);
// a plugin id like 'example.hello' would make this cast a lie and break
// LAUNCHER_MODULE_IDS.has(pluginId) in useDockLayout.ts.
export const LAUNCHER_MODULES: readonly LauncherModule[] = getLauncherContributions()
  .map((c) => ({ id: c.id as DockPanelId, description: c.description }))

export const LAUNCHER_MODULE_IDS: ReadonlySet<DockPanelId> = new Set(
  LAUNCHER_MODULES.map((m) => m.id),
)
