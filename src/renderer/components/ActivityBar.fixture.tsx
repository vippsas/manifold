import { ActivityBar, type ActivityBarProps } from './ActivityBar'
import { registerPanelContribution } from '../plugins/contribution-registry'
import type { PluginIconId } from '../../shared/plugins/icons'

const visible: string[] = ['sidebar', 'agent', 'manifold.statistics.panel']

const dockLayout: ActivityBarProps['dockLayout'] = {
  isPanelVisible: (id) => visible.includes(id),
  togglePanel: () => undefined,
  focusPanel: () => undefined,
}

// The rail's plugin group reads the live registry, so the fixture stands in for
// what the main process would have sent: the four bundled plugins plus one that
// names no icon, to show the fallback glyph next to the named ones.
const pluginViews: Array<{ id: string; title: string; icon?: PluginIconId }> = [
  { id: 'manifold.worktrees.panel', title: 'Worktrees', icon: 'layers' },
  { id: 'manifold.statistics.panel', title: 'Statistics', icon: 'chart' },
  { id: 'manifold.loop.panel', title: 'Autoresearch Loop', icon: 'loop' },
  { id: 'manifold.watch.panel', title: 'Watch', icon: 'video' },
  { id: 'example.unnamed.panel', title: 'Unnamed Plugin' },
]
for (const view of pluginViews) {
  registerPanelContribution({ ...view, description: '', launcher: false, source: 'plugin' })
}

export default (
  <div style={{ display: 'flex', height: 480, width: 260, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
    <ActivityBar
      dockLayout={dockLayout}
      sidebarView="sourceControl"
      onSelectSidebarView={() => undefined}
      hasActiveSession
      sourceControlChangeCount={4}
      onOpenSettings={() => undefined}
      pluginRail={{
        isOpen: (viewId) => visible.includes(viewId),
        onOpen: () => undefined,
        onClose: () => undefined,
      }}
    />
  </div>
)
