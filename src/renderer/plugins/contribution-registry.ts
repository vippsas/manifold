// src/renderer/plugins/contribution-registry.ts
import type React from 'react'
import type { PanelContribution } from '../../shared/plugins/contributions'
import { INTERNAL_PANELS } from './internal-contributions'

/** A panel contribution as held by the registry. Internal contributions carry a
 *  renderer component; plugin contributions (Phase 1) resolve to a webview and
 *  leave `component` undefined. */
export interface RegisteredPanel extends PanelContribution {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component?: React.FC<any>
}

/** id → contribution. Map insertion order is preserved and defines launcher order. */
const panels = new Map<string, RegisteredPanel>()

function seed(): void {
  panels.clear()
  for (const panel of INTERNAL_PANELS) panels.set(panel.id, panel)
}
seed()

/** Add (or replace) a panel contribution. Phase 1 plugins call this at activation. */
export function registerPanelContribution(panel: RegisteredPanel): void {
  panels.set(panel.id, panel)
}

/** All registered panel contributions, in registration order. */
export function getPanelContributions(): RegisteredPanel[] {
  return [...panels.values()]
}

/** Contributions that should appear in the "+ Apps" launcher. */
export function getLauncherContributions(): RegisteredPanel[] {
  return [...panels.values()].filter((p) => p.launcher)
}

/** The set of launcher panel ids. */
export function getLauncherContributionIds(): Set<string> {
  return new Set(getLauncherContributions().map((p) => p.id))
}

/** id → renderer component, for contributions that have one (internal modules). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPanelComponents(): Record<string, React.FC<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, React.FC<any>> = {}
  for (const panel of panels.values()) {
    if (panel.component) out[panel.id] = panel.component
  }
  return out
}

/** Reset the registry to just the built-in internal contributions (for tests). */
export function resetToInternal(): void {
  seed()
}
