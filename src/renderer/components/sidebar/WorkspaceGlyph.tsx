// Layers glyph marking a Workspace (a multi-root group of repos). Shared by the
// sidebar workspace card and the New-Agent heading so they read as the same thing.
export function WorkspaceGlyph({ active = false }: { active?: boolean }) {
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
      <path d="M12 3 21 8 12 13 3 8Z" />
      <path d="M3 13 12 18 21 13" />
    </svg>
  )
}
