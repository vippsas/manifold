// Git-branch glyph marking a single Repo. Pairs with WorkspaceGlyph so a repo
// reads as one branch and a workspace reads as a stack of them.
export function RepoGlyph({ active = false }: { active?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      style={{ flexShrink: 0, color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}
