// Two-page "files" glyph marking the Explorer view in the sidebar activity bar.
// Drawn with currentColor so the activity-icon button drives its color across
// resting / hover / active states (unlike RepoGlyph, which fixes its own color).
export function FilesGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M9 4h6l4 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M15 4v4h4" />
      <path d="M7 8H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2" />
    </svg>
  )
}
