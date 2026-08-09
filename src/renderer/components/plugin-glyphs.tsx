import React from 'react'
import { type PluginIconId } from '../../shared/plugins/icons'

/** Drawn the way PANEL_GLYPH_PATHS is (24 viewBox, 1.6 stroke, currentColor) so
 *  a plugin's rail icon is indistinguishable in weight and theming from a
 *  built-in one.
 *
 *  Names describe the shape, not the plugin that happens to use it. There is
 *  deliberately no branch glyph: Source Control already owns that shape a few
 *  rows up the same rail, and a second one would read as the same button.
 *  `plugin` is the fallback — the detached-square "extensions" mark, which says
 *  "an add-on" without claiming to describe what the add-on does. */
const PLUGIN_GLYPH_PATHS: Record<PluginIconId, React.JSX.Element> = {
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 16.5v-4M12 16.5V8M16 16.5v-6" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8 4.5-8 4.5-8-4.5Z" />
      <path d="m4 12 8 4.5 8-4.5" />
      <path d="m4 16.5 8 4.5 8-4.5" />
    </>
  ),
  loop: (
    <>
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3.5V8h-4.5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 20.5V16h4.5" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m10.5 9 5 3-5 3Z" />
    </>
  ),
  plugin: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" />
      <path d="M17.25 2.5 21.5 6.75l-4.25 4.25L13 6.75Z" />
    </>
  ),
}

/** A plugin view's rail icon. An unknown or absent name falls back to `plugin`,
 *  so a view contributed by a newer plugin still gets a usable icon here. */
export function PluginGlyph({ icon, size = 18 }: { icon?: PluginIconId; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PLUGIN_GLYPH_PATHS[icon ?? 'plugin'] ?? PLUGIN_GLYPH_PATHS.plugin}
    </svg>
  )
}
