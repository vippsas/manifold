// Folder glyph marking a Workspace (a multi-root group of repos). Shared by the
// sidebar workspace card and the New-Agent heading so they read as the same
// thing, and drawn like the repo rows' folder so the sidebar reads as one tree.
export function WorkspaceGlyph({ active = false }: { active?: boolean }) {
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
      style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}
