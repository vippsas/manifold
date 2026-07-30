import { ActivityBar, type ActivityBarProps } from './ActivityBar'
import type { DockPanelId } from '../hooks/dock-layout/useDockLayout'

const visible: DockPanelId[] = ['projects', 'agent', 'modifiedFiles']

const dockLayout: ActivityBarProps['dockLayout'] = {
  isPanelVisible: (id) => visible.includes(id),
  togglePanel: () => undefined,
}

export default (
  <div style={{ display: 'flex', height: 480, width: 260, background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
    <ActivityBar dockLayout={dockLayout} hasActiveSession onOpenSearch={() => undefined} onOpenSettings={() => undefined} />
  </div>
)
