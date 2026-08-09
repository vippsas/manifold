// src/shared/plugins/icons.ts
/** Icon names a view contribution may claim. The host ships the glyphs, so the
 *  set is closed: a plugin picks a name, not a drawing. That keeps every rail
 *  icon at the same stroke weight and theming as the built-in ones, and keeps
 *  plugin-supplied markup out of the workbench chrome.
 *
 *  Shared by the main-process manifest parser and the renderer glyph table so
 *  the two cannot drift. `plugin` is the fallback for a view that names no icon
 *  or names one this host doesn't know. */
export const PLUGIN_ICON_IDS = ['chart', 'layers', 'loop', 'video', 'plugin'] as const
export type PluginIconId = typeof PLUGIN_ICON_IDS[number]

export function isPluginIconId(value: unknown): value is PluginIconId {
  return typeof value === 'string' && (PLUGIN_ICON_IDS as readonly string[]).includes(value)
}
