const ADD_DIR_PATTERN = /Added\s+(\/[^\n]+?)\s+as a working directory/
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

export function detectAddDir(output: string): string | null {
  const clean = output.replace(ANSI_ESCAPE, '')
  const match = clean.match(ADD_DIR_PATTERN)
  if (!match) return null
  return match[1].replace(/\/+$/, '')
}
