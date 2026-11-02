import React from 'react'
import type { AgentRuntime } from '../../../../shared/types'
import { AgentLaunchList } from '../../modals/AgentLaunchList'
import type { AgentMode } from '../../modals/useNewAgentForm'
import { shellTabStyles as styles } from '../../terminal/ShellTabs.styles'

const MENU_WIDTH = 300

export interface AgentQuickAddMenuProps {
  /** Viewport position of the menu's top-left corner. */
  anchor: { top: number; left: number }
  /** The runtime that leads the list — the workspace's, else the default. */
  leadRuntimeId: string
  onPick: (runtimeId: string, mode: AgentMode) => void
  /** Hands over to the full New Agent dialog. */
  onMore: () => void
}

/** The runtime list under the header "+" caret: the same rows as the New Agent
 *  dialog (`AgentLaunchList` — install status, the lead one on the gold plate),
 *  without taking the screen over. Picking a row starts that agent directly.
 *
 *  The caller portals it to `document.body` and owns open/close, outside-click
 *  and Escape: a `position: fixed` menu inside a dockview panel is otherwise
 *  offset by the panel's transformed overlay. */
export const AgentQuickAddMenu = React.forwardRef<HTMLDivElement, AgentQuickAddMenuProps>(
  function AgentQuickAddMenu({ anchor, leadRuntimeId, onPick, onMore }, ref): React.JSX.Element {
    const [runtimes, setRuntimes] = React.useState<AgentRuntime[]>([])
    const moreRef = React.useRef<HTMLButtonElement>(null)

    React.useEffect(() => {
      let live = true
      void window.electronAPI.invoke('runtimes:list').then((list) => {
        if (live) setRuntimes(list as AgentRuntime[])
      })
      return () => { live = false }
    }, [])

    // The list focuses its first launchable row. With nothing installed there is
    // none, and focus would stay on the caret — behind a portal, so Tab would walk
    // the app instead of this menu — so "More…" takes it.
    React.useEffect(() => {
      if (runtimes.length > 0 && !runtimes.some((rt) => !rt.needsModel && rt.installed !== false)) {
        moreRef.current?.focus()
      }
    }, [runtimes])

    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - MENU_WIDTH - 8))
    return (
      <div
        ref={ref}
        role="group"
        aria-label="Start an agent"
        style={{ ...styles.shellTypeMenu, top: anchor.top, left, width: MENU_WIDTH, padding: '8px' }}
      >
        <AgentLaunchList
          runtimes={runtimes}
          pending={null}
          leadRuntimeId={leadRuntimeId}
          // The rows arrive after mount, and the list only focuses its first one
          // when this changes — so the popover is keyboard-operable once loaded.
          focusTrigger={runtimes.length}
          onLaunch={onPick}
        />
        <button
          ref={moreRef}
          type="button"
          style={{ ...styles.shellTypeMenuItem, ...styles.shellTypeMenuItemSeparated }}
          onClick={onMore}
        >
          More…
        </button>
      </div>
    )
  },
)
