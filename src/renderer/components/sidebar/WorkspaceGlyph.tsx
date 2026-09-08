import type { WorkspaceGlyphKind } from '../../../shared/workspace-types'

// Glyph marking a Workspace in the sidebar. Shared by the workspace card, the
// favorites rows and the Working-now rows so they read as the same thing.
//
// The kind is in the shape, because the name alone cannot say which is which:
// a **home** workspace is a folder — the repo's own clone; a **worktree**
// workspace is a branch cut off it; a **multi**-repo workspace is two linked
// frames — a task spanning repos, whichever checkouts it owns.
export function WorkspaceGlyph({ active = false, kind = 'home' }: { active?: boolean; kind?: WorkspaceGlyphKind }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      data-glyph={kind}
      style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {kind === 'worktree' && (
        <>
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="2.6" />
          <circle cx="6" cy="18" r="2.6" />
          <path d="M18 8.6a9 9 0 0 1-9 9" />
        </>
      )}
      {kind === 'multi' && (
        <>
          <rect x="3" y="3" width="11" height="11" rx="2" />
          <path d="M10 21h9a2 2 0 0 0 2-2v-9" />
          <path d="M14 10h3a2 2 0 0 1 2 2v3" />
        </>
      )}
      {kind === 'home' && (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      )}
    </svg>
  )
}
