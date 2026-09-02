import type { SidebarSortMode } from './sidebar-sort'

export function NewAgentGlyph(): React.JSX.Element {
  return <span aria-hidden="true">+</span>
}

/** The workspace row's only control: the "more actions" ellipsis, which opens
 *  the worded menu.
 *
 *  It replaced a fork glyph and a folder-plus glyph sitting side by side — two
 *  abstractions a new user had to decode from a 14px silhouette, with the words
 *  only in a native `title` that takes a second to appear. A `+` stood here
 *  briefly, but a plus promises *adding*, and once the row's `×` folded into
 *  this menu the most consequential item behind it removes the workspace. The
 *  ellipsis is the overflow affordance every toolbar already teaches, and unlike
 *  a `▾` it cannot be confused with the disclosure chevron the row's own glyph
 *  swaps to on hover. */
export function WorkspaceActionsGlyph(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  )
}

/** Disclosure chevron on a repo row — points right when its files are hidden,
 *  down when they are showing. Matches the file tree's own directory chevron so
 *  a repo reads as the folder its files hang under. */
export function FilesChevronGlyph({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.1s ease' }}
    >
      <path d="M6.5 4l4 4-4 4" />
    </svg>
  )
}

export function ConfigureAgentGlyph(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  )
}

/** Which order the workspace list is in: descending bars with an arrow for A–Z,
 *  a clock for most-recently-used. It shows the mode you are *in*, not the one a
 *  click would switch to — the label says what the click does. */
export function SortModeGlyph({ mode }: { mode: SidebarSortMode }): React.JSX.Element {
  const stroke = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const

  if (mode === 'alpha') {
    return (
      <svg {...stroke} aria-hidden="true">
        <path d="M4 6h9" />
        <path d="M4 12h6" />
        <path d="M4 18h3" />
        <path d="M18 4v15" />
        <path d="M15 16l3 3 3-3" />
      </svg>
    )
  }

  return (
    <svg {...stroke} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

/** The pane header's actions wear VS Code's own explorer silhouettes, drawn on
 *  the same 24-unit grid and 2px stroke as the glyphs above so the row reads as
 *  one set. Each one's meaning lives in its `aria-label` and tooltip — the
 *  header is a toolbar, and a toolbar's icons are learned once. */
const headerGlyph = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Registering a repo: a document with a plus, VS Code's "New File". */
export function NewRepoGlyph(): React.JSX.Element {
  return (
    <svg {...headerGlyph} aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5" />
      <path d="M14 3l5 5v3" />
      <path d="M18 15v6M15 18h6" />
    </svg>
  )
}

/** Creating a workspace: a folder with a plus, VS Code's "New Folder". */
export function NewWorkspaceGlyph(): React.JSX.Element {
  return (
    <svg {...headerGlyph} aria-hidden="true">
      <path d="M21 13V9a2 2 0 0 0-2-2h-8l-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7" />
      <path d="M18 15v6M15 18h6" />
    </svg>
  )
}

/** Closing every open workspace at once, VS Code's "Collapse Folders". */
export function CollapseAllGlyph(): React.JSX.Element {
  return (
    <svg {...headerGlyph} aria-hidden="true">
      <rect x="3" y="3" width="13" height="13" rx="2" />
      <path d="M7 9.5h5" />
      <path d="M19 8v11a2 2 0 0 1-2 2H6" />
    </svg>
  )
}
