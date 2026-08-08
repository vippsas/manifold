import type { SidebarSortMode } from './sidebar-sort'

export function NewAgentGlyph(): React.JSX.Element {
  return <span aria-hidden="true">+</span>
}

/** A branch forking off — "copy this workspace onto a fresh worktree". */
export function CopyWorkspaceGlyph(): React.JSX.Element {
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
      <circle cx="6" cy="5" r="2.4" />
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="12" r="2.4" />
      <path d="M6 7.4v9.2" />
      <path d="M6 9c0 3 4.5 3 9.6 3" />
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
      fill="currentColor"
      aria-hidden="true"
      style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.1s ease' }}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function RepoGlyph(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}

export function AddFolderGlyph(): React.JSX.Element {
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
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v10H5a2 2 0 0 1-2-2Z" />
      <path d="M11 11v5M8.5 13.5h5" />
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
