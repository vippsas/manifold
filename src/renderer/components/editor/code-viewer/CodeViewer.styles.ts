import type React from 'react'

export const viewerStyles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-primary)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    flexShrink: 0,
  },
  headerText: {
    fontSize: 'inherit',
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  // The same chrome the dock's tab strips carry, so the editor's file tabs and
  // the agent tabs one panel over read as one row of tabs rather than two.
  tabBar: {
    display: 'flex',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border)',
    background: 'linear-gradient(180deg, var(--bg-chrome-hi, var(--bg-chrome)) 0%, var(--bg-chrome) 100%)',
    flexShrink: 0,
    minWidth: 0,
  },
  tabStrip: {
    display: 'flex',
    alignItems: 'stretch',
    alignContent: 'flex-start',
    flexWrap: 'wrap' as const,
    overflow: 'visible' as const,
    minWidth: 0,
    flex: '1 1 0',
  },
  // The pane's actions ride at the right of the first tab row. Their pills carry
  // their own vertical margin, like every other header control, so the strip
  // stays exactly one tab tall.
  tabActions: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end',
    gap: '2px',
    marginLeft: 'auto',
    padding: '0 var(--space-xs)',
    flexShrink: 0,
  },
  // Colour, hover and the active tab's accent rule live in theme.css under
  // `.code-tab` — they are state, and inline styles cannot express hover.
  // VS Code's tab geometry — 10px of room before the icon, the close action in a
  // slot of its own, and "shrink" sizing: content-width with an 80px floor, so a
  // two-letter name still makes a tab you can hit and the strip is not ragged.
  // Two numbers are ours, because this pane is a ~330px sidebar rather than VS
  // Code's full-width editor area and the strip wraps instead of scrolling: the
  // row is 30px like the header above it (35px would stack to 70px the moment a
  // third file opened), and a tab is capped so one long name cannot push every
  // other tab onto a row of its own.
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    height: '30px',
    padding: '0 0 0 10px',
    fontSize: 'inherit',
    borderRight: '1px solid var(--divider)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    flex: '0 1 auto',
    minWidth: '80px',
    maxWidth: '220px',
    overflow: 'hidden',
  },
  tabLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 'var(--space-xs)',
    flex: '1 1 auto',
    minWidth: 0,
    maxWidth: '100%',
    padding: 0,
    fontSize: 'inherit',
    color: 'inherit',
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    textAlign: 'left' as const,
  },
  tabLabelName: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  // The folder that tells two same-named files apart, in VS Code's muted
  // "description" role beside the name rather than as a second title.
  tabLabelDescription: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  // VS Code gives the close action a 28px slot holding a 16px glyph; the slot is
  // what makes the label stop short of the tab's edge instead of running into it.
  tabClose: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    margin: '0 4px',
    fontSize: '14px',
    lineHeight: 1,
    color: 'var(--text-muted)',
    borderRadius: 'var(--radius-xs)',
    flexShrink: 0,
  },
  iconCaret: {
    width: 0,
    height: 0,
    borderLeft: '3px solid transparent',
    borderRight: '3px solid transparent',
    borderTop: '4px solid currentColor',
    opacity: 0.75,
    flexShrink: 0,
  },
  actionMenuOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
  },
  actionMenu: {
    position: 'fixed',
    zIndex: 201,
    minWidth: '148px',
    padding: '4px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    boxShadow: 'var(--shadow-popover)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  actionMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '6px 8px',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
    textAlign: 'left' as const,
    whiteSpace: 'normal' as const,
    maxWidth: '260px',
    cursor: 'pointer',
  },
  actionMenuItemLabel: {
    fontSize: '0.92em',
    lineHeight: 1.2,
  },
  actionMenuItemText: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    minWidth: 0,
  },
  actionMenuItemDescription: {
    fontSize: '0.82em',
    lineHeight: 1.25,
    color: 'var(--text-muted)',
    whiteSpace: 'normal' as const,
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
    flexShrink: 0,
    marginRight: '4px',
  },
  htmlPreview: {
    width: '100%',
    height: '100%',
    border: 'none',
    background: '#ffffff',
  },
  editorContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    height: '22px',
    padding: '0 10px',
    flexShrink: 0,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
  },
  statusItem: {
    whiteSpace: 'nowrap' as const,
  },
  statusSpacer: {
    flex: 1,
  },
}
