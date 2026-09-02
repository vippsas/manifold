import type React from 'react'

export const sidebarStyles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  // VS Code's pane header: 22px tall, its title 11px bold uppercase, and its
  // actions hidden until the header is hovered or holds focus. The title is a
  // button — clicking it collapses the whole section, chevron and all.
  actionToolbar: {
    display: 'flex',
    alignItems: 'center',
    height: '22px',
    padding: '0 var(--space-xs)',
    background: 'transparent',
    flexShrink: 0,
  },
  toolbarLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flex: 1,
    minWidth: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'var(--type-label)',
    fontWeight: 700,
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    textAlign: 'left',
    cursor: 'pointer',
    userSelect: 'none',
  },
  // 22px square, matching the header's own height, so the icon row never makes
  // the header taller than a list row.
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: 0,
    border: 0,
    borderRadius: 'var(--radius-xs)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  // Holds the header's actions as one right-aligned cluster. Revealed on hover
  // or focus-within by `.sidebar-pane-actions` in theme.css.
  toolbarActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },
  list: {
    padding: 'var(--space-xs) 0',
  },
  item: {
    cursor: 'pointer',
    fontWeight: 400,
    color: 'var(--text-secondary)',
    marginTop: 0,
  },
  rowChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '-4px',
    marginRight: '2px',
    color: 'var(--text-muted)',
    flexShrink: 0,
  },
  // The sidebar is a ladder of 8px steps — the file tree's own per-depth indent
  // — so every chevron sits one step right of its parent's: the workspace row,
  // then its folders, then those folders' files. The file tree adds its own 4px
  // to whatever it is given, so this margin is the folder step, not the file's.
  projectFiles: {
    marginLeft: 'var(--sidebar-indent-files)',
  },
  worktreeFiles: {
    marginLeft: 'calc(var(--sidebar-indent-files) + 8px)',
  },
  itemActive: {
    color: 'var(--text-primary)',
  },
  // The row's label: its name, then whatever dimmed detail trails it, then the
  // working dot. No flex gap — each trailing piece carries its own 6px, so the
  // name and its description sit as one phrase rather than three even columns.
  rowLabelPath: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
  },
  itemName: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    font: 'inherit',
    fontWeight: 600,
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-xs)',
    padding: '0 4px',
    outline: 'none',
  },
  itemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginLeft: '4px',
    flexShrink: 0,
  },
  removeButton: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    padding: 0,
    lineHeight: 1,
    background: 'transparent',
  },
  // When the base branch is behind origin, the fetch button becomes an accent
  // pill so the ↻ glyph stays visible next to the count, instead of a badge
  // overlapping (and hiding) the icon. Overrides the fixed 16px width/height
  // and muted color of .sidebar-icon-button.
  fetchPill: {
    width: 'auto',
    height: 'auto',
    gap: '3px',
    padding: '1px 6px',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--accent)',
    color: 'var(--accent-text)',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 700,
    lineHeight: 1,
    opacity: 1,
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  },
  // Indented past the folder row's own glyph column so the outcome of a fetch
  // reads as belonging to the row above it.
  fetchMessage: {
    padding: '2px 14px 4px 40px',
    fontSize: 'var(--type-ui-caption)',
    color: 'var(--text-muted)',
  },
  addButton: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--accent)',
    padding: 0,
    lineHeight: 1,
    background: 'transparent',
  },
  // The workspace row's actions menu trigger. Accent rather than muted like the
  // other row glyphs: it is the row's only control, and being *found* is the
  // whole reason it exists.
  rowMenuButton: {
    color: 'var(--accent)',
    padding: 0,
    lineHeight: 1,
    background: 'transparent',
  },
  cardActions: {
    display: 'flex',
    gap: 'var(--space-xs)',
    padding: 'var(--space-xs) var(--space-sm) var(--space-sm)',
  },
  cardActionButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    flex: 1,
    minWidth: 0,
    minHeight: 'var(--control-height)',
    padding: '0 var(--space-sm)',
    border: '1px solid var(--control-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--control-bg)',
    color: 'var(--text-secondary)',
    fontSize: 'var(--type-ui-small)',
    cursor: 'pointer',
    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
  },
  agentItem: {
    cursor: 'pointer',
    margin: '0',
    width: '100%',
    textAlign: 'left' as const,
    fontSize: 'inherit',
    color: 'var(--text-primary)',
    background: 'transparent',
  },
  agentBranch: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'var(--font-mono)',
    fontSize: 'inherit',
  },
  agentRuntime: {
    fontSize: 'var(--type-ui-caption)',
    flexShrink: 0,
  },
  agentDeleteButton: {
    fontSize: 'var(--type-ui-small)',
    color: 'var(--text-muted)',
    padding: 0,
    lineHeight: 1,
    flexShrink: 0,
    cursor: 'pointer',
    background: 'transparent',
  },
  agentNameInput: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'inherit',
    fontWeight: 600,
  },
  empty: {
    padding: '16px 12px',
    color: 'var(--text-muted)',
    fontSize: 'inherit',
    textAlign: 'center' as const,
  },
  cloneForm: {
    display: 'flex',
    padding: '0 8px 8px',
    gap: '4px',
  },
  cloneInput: {
    flex: 1,
    fontSize: 'inherit',
    padding: '4px 8px',
  },
  cloneSubmit: {
    padding: '0 10px',
    background: 'var(--btn-bg)',
    color: 'var(--btn-text)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'inherit',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--space-xs)',
    padding: '0 var(--space-sm)',
    marginBottom: 'var(--space-xs)',
  } as React.CSSProperties,
  sectionDivider: {
    height: 1,
    background: 'color-mix(in srgb, var(--accent), transparent 94%)',
    margin: 'var(--space-sm) var(--space-xs)',
  } as React.CSSProperties,
  // The same pane header the Workspaces title wears, so Favorites reads as a
  // sibling section rather than a differently-styled label above the same list.
  sectionLabelToggle: {
    fontSize: 'var(--type-label)',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    color: 'var(--text-secondary)',
    height: '22px',
    padding: '0 var(--space-xs)',
    marginBottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    cursor: 'pointer',
    userSelect: 'none' as const,
    border: 0,
    background: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
  } as React.CSSProperties,
  sectionHeaderToggle: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    marginBottom: 0,
  } as React.CSSProperties,
  sectionCount: {
    fontSize: 'var(--type-label)',
    color: 'var(--text-muted)',
    marginLeft: '2px',
  } as React.CSSProperties,
}
