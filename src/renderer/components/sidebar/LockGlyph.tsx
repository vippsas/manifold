// Padlock glyph marking a locked (deletion-protected) agent. Inline SVG using
// currentColor so the surrounding button/indicator controls its color, matching
// RepoGlyph/WorkspaceGlyph. `locked` swaps the closed shackle for an open one.
export function LockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.9-1" />}
    </svg>
  )
}
