export interface RuntimeOption {
  id: string
  label: string
}

export const RUNTIME_OPTIONS: RuntimeOption[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'copilot', label: 'Copilot' },
]

export const SEARCH_RUNTIME_OPTIONS: RuntimeOption[] = [
  { id: 'default', label: 'Default Runtime' },
  ...RUNTIME_OPTIONS,
]
