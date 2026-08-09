import React from 'react'
import { usePluginContributions } from '../plugins/use-contributions'
import { PluginGlyph } from './plugin-glyphs'
import { activityBarStyles } from './ActivityBar.styles'

export interface PluginRailProps {
  /** Whether the plugin view's dock panel is currently open. */
  isOpen: (viewId: string) => boolean
  /** Open the view's dock panel; `kind` picks the webview or tree path. */
  onOpen: (viewId: string, title: string, kind?: 'webview' | 'tree') => void
  /** Close the view's dock panel. */
  onClose: (viewId: string) => void
}

/** The rail's third group: one icon per view an enabled plugin contributes,
 *  toggling that view's dock panel exactly the way the Agent/Editor/Shell icons
 *  above it toggle theirs.
 *
 *  Renders nothing at all — divider included — when no enabled plugin
 *  contributes a view: a separator hanging above empty space reads as a bug. */
export function PluginRailGroup({ isOpen, onOpen, onClose }: PluginRailProps): React.JSX.Element | null {
  const views = usePluginContributions()
  if (views.length === 0) return null

  return (
    <>
      <span style={activityBarStyles.divider} aria-hidden />
      {views.map((view) => {
        const open = isOpen(view.id)
        return (
          <button
            key={view.id}
            type="button"
            className={`activity-bar-item${open ? ' activity-bar-item--active' : ''}`}
            onClick={() => (open ? onClose(view.id) : onOpen(view.id, view.title, view.kind))}
            aria-label={view.title}
            aria-pressed={open}
          >
            <PluginGlyph icon={view.icon} />
            <span className="activity-bar-tooltip" role="presentation">
              {view.title}
            </span>
          </button>
        )
      })}
    </>
  )
}
