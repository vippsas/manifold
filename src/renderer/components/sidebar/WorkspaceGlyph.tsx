// Glyph marking a Workspace in the sidebar. Shared by the sidebar workspace card
// and the New-Agent heading so they read as the same thing.
//
// The kind is in the shape, because the sidebar lists both side by side and the
// name alone cannot say which is which: a **home** workspace is a folder — the
// repo's own clone, the one you opened — while a **worktree** workspace is a
// branch cut off it, drawn as one. The folder matches the repo rows' folder so a
// home workspace reads as one tree with its folders underneath.
export function WorkspaceGlyph({ active = false, worktree = false }: { active?: boolean; worktree?: boolean }) {
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
      data-glyph={worktree ? 'worktree' : 'folder'}
      style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {worktree ? (
        <>
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="2.6" />
          <circle cx="6" cy="18" r="2.6" />
          <path d="M18 8.6a9 9 0 0 1-9 9" />
        </>
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      )}
    </svg>
  )
}
