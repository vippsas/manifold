import type React from 'react'

export const shellTabStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  headerTabBar: {
    display: 'flex',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    minWidth: 0,
    gap: 0,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    minWidth: 0,
  },
  headerAddMenu: {
    position: 'relative' as const,
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'stretch',
    // Same inset the group-level × keeps (`.dock-header-collapse`), so the
    // pills stop short of the card edge like every other header control.
    marginRight: '4px',
    flexShrink: 0,
  },
  // The same pill the dock's header controls use (see `.dock-tab__close` /
  // `.dock-header-collapse` in theme.css): a 24px rounded square centered in the
  // 30px strip, rather than a full-height button with a divider rule.
  headerAddButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
    fontFamily: 'inherit',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  // The dropdown reads as an appendix to the +, not a peer of it: a narrow
  // strip flush against it, the way VS Code hangs the launch-profile chevron
  // off its New Terminal button.
  headerAddChevron: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '15px',
    height: '24px',
    padding: 0,
    lineHeight: 1,
    fontFamily: 'inherit',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  // The close (×) that kills the active terminal — the same 24px pill as the +,
  // held at the far right of the header strip with the group-level card inset.
  headerCloseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    marginRight: '4px',
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
    fontFamily: 'inherit',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    flexShrink: 0,
  },
  shellTypeMenu: {
    position: 'fixed' as const,
    zIndex: 9999,
    minWidth: '168px',
    padding: '4px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    boxShadow: 'var(--shadow-popover)',
  },
  shellTypeMenuItem: {
    display: 'block',
    width: '100%',
    padding: '6px 8px',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    color: 'var(--text-secondary)',
    textAlign: 'left' as const,
    whiteSpace: 'nowrap' as const,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
  },
  // Sets the skip-the-picker item apart from the two shell-type items above it.
  shellTypeMenuItemSeparated: {
    marginTop: '4px',
    paddingTop: '7px',
    borderTop: '1px solid var(--border)',
  },
  folderMenu: {
    minWidth: '224px',
    maxWidth: '320px',
  },
  // Two lines per row: the folder's name, then its path. The path is what tells
  // two worktrees of the same repo apart, so it is present but subordinate.
  folderMenuItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
    width: '100%',
    padding: '5px 8px',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    color: 'var(--text-secondary)',
    textAlign: 'left' as const,
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
  },
  folderMenuName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    color: 'var(--text-primary)',
  },
  // Plain end-ellipsis: the shared prefix is already gone by the time this
  // renders (`describeShellFolder`), so what is left is the distinguishing part
  // and reads left to right. `direction: rtl` would ellipsize from the start
  // but reorders the leading slash to the far end, showing a slash that is not
  // in the path.
  folderMenuPath: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
  },
  // The panel body is a row: terminals on the left, the terminal list on the
  // right, the way VS Code lays its terminal view out.
  body: {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  tabList: {
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
    width: '148px',
  },
  // Room for the folder beside the shell's name. VS Code leaves this to the
  // user — its strip is draggable — but ours is a fixed width, so it has to
  // widen itself when there is a folder to show.
  tabListWithFolders: {
    width: '204px',
    paddingTop: '4px',
    overflowY: 'auto' as const,
    borderLeft: '1px solid var(--border)',
  },
  // The row is a container, not a control: it holds two real buttons (select
  // and kill), which a <button> row would have nested illegally.
  tab: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    paddingRight: '4px',
    color: 'var(--text-muted)',
    borderLeft: '2px solid transparent',
    whiteSpace: 'nowrap' as const,
  },
  tabActive: {
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    borderLeft: '2px solid var(--accent)',
  },
  tabSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
    padding: '3px 0 3px 6px',
    fontSize: 'inherit',
    fontFamily: 'inherit',
    color: 'inherit',
    textAlign: 'left' as const,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  tabGlyph: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  tabLabel: {
    flexShrink: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  // VS Code's terminal tab is a name plus a dimmer description, with the folder
  // in the description (`tabs.description` defaults to `…${cwdFolder}`) rather
  // than in the title. Same split here: the shell keeps its name, the folder
  // rides alongside it and only when the workspace has more than one.
  tabFolder: {
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: 'var(--type-ui-micro)',
    color: 'var(--text-muted)',
  },
  tabKillButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    padding: 0,
    borderRadius: 'var(--radius-xs)',
    color: 'var(--text-muted)',
    lineHeight: 1,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    borderRadius: '3px',
    color: 'var(--text-muted)',
    fontSize: '14px',
    lineHeight: 1,
    cursor: 'pointer',
    marginRight: '4px',
  },
  errorStrip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '4px 8px',
    fontSize: 'inherit',
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    borderBottom: '1px solid var(--border)',
  },
  errorDismiss: {
    padding: 0,
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  terminalArea: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  terminalContainer: {
    width: '100%',
    height: '100%',
    padding: '8px',
    boxSizing: 'border-box' as const,
  },
}
