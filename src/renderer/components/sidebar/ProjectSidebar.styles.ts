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
  actionToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
    minHeight: '32px',
    padding: 'var(--space-xs) var(--space-sm)',
    background: 'transparent',
    flexShrink: 0,
  },
  toolbarLabel: {
    paddingLeft: '8px',
    fontSize: 'var(--type-ui-small)',
    fontWeight: 500,
    color: 'var(--text-muted)',
    userSelect: 'none',
  },
  toolbarButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    border: '1px solid transparent',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
  },
  toolbarButtonPrimary: {
    color: 'var(--text-secondary)',
    marginLeft: 'auto',
  },
  // Holds both toolbar actions as one right-aligned cluster, so Add stays at the
  // edge with Sort beside it. toolbarButtonPrimary's own marginLeft: 'auto' is
  // inert inside a content-sized group, so it needs no change.
  toolbarActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-xs)',
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
  // — so every chevron sits one step right of its parent's: the workspace card,
  // then its folders and its worktrees, then a worktree's files.
  projectFiles: {
    marginLeft: '24px',
  },
  worktreeFiles: {
    marginLeft: '32px',
  },
  rowGlyph: {
    display: 'inline-flex',
    alignItems: 'center',
    marginRight: 'var(--space-xs)',
    color: 'var(--text-muted)',
    verticalAlign: '-2px',
  },
  itemActive: {
    color: 'var(--text-primary)',
  },
  // The repo a workspace row belongs to, dimmed ahead of the row's own name.
  // Capped rather than flexible so the name — the row's identity — is the last
  // thing to truncate.
  // `repo / name` as one unit. Sits inside the label's 6px flex gap rather than
  // being spaced by it, so that gap keeps separating the status dot from the
  // name without also widening the two joins of the path itself.
  rowLabelPath: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    overflow: 'hidden',
  },
  // Sized to its text, so the separator always sits right after the repo. An
  // ellipsis cuts at a character boundary inside a fixed-width box, so any cap
  // that bites leaves dead space between the repo and the "/" — the name absorbs
  // the row's width pressure instead (`flexShrink: 0` here, so only the name
  // gives), and the cap is only a backstop against a pathological repo erasing
  // the name entirely.
  //
  // The cap is a length, not a percentage. A percentage resolves against
  // `rowLabelPath`, which is shrink-to-fit, so it scaled with the row's *own*
  // text instead of the space available — biting hardest on the short rows that
  // had room to spare, and never on the long ones it was written for. At
  // `calc(100% - 5ch)` that rendered `apex / zed` as `a… / zed`. 28ch clears a
  // real repo folder name (`commerce-platform-services`, 26, fits) while still
  // capping a pathological one.
  rowRepo: {
    color: 'var(--text-muted)',
    maxWidth: '28ch',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  rowRepoSep: {
    color: 'var(--text-muted)',
    opacity: 0.55,
    margin: '0 3px',
    flexShrink: 0,
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
  // A bar of its own below the scrolling list, so however long the list grows
  // the create action stays where it was — the sidebar's one fixed edge.
  actions: {
    display: 'flex',
    padding: 'var(--space-sm)',
    borderTop: '1px solid var(--border)',
    flexShrink: 0,
  },
  // Transparent behind an accent hairline: unmistakably a control rather than
  // one more row, while staying under the metal plate the primary agent CTA
  // owns. Hover brightens the hairline (.sidebar-new-workspace-button).
  newWorkspaceButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-xs)',
    height: 'var(--control-height)',
    padding: '0 var(--space-sm)',
    border: '1px solid color-mix(in srgb, var(--accent), transparent 70%)',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 'var(--type-ui-small)',
    cursor: 'pointer',
    transition: 'border-color var(--duration-normal) var(--ease-premium), background var(--duration-normal) var(--ease-premium)',
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
  sectionLabelToggle: {
    fontSize: 'var(--type-label)',
    fontWeight: 500,
    letterSpacing: 'var(--tracking-wide)',
    textTransform: 'uppercase' as const,
    color: 'color-mix(in srgb, var(--accent), transparent 60%)',
    padding: '0 var(--space-sm)',
    marginBottom: 'var(--space-xs)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
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
