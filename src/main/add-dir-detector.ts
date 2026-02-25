const ADD_DIR_PATTERN = /Added\s+(\/[^\n]+?)\s+as a working directory/
// Cursor movement (e.g. \x1b[1C = move right 1) must become spaces, not be stripped
const CURSOR_FORWARD = /\x1b\[\d*C/g
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

export function detectAddDir(output: string): string | null {
  const clean = output.replace(CURSOR_FORWARD, ' ').replace(ANSI_ESCAPE, '')
  const match = clean.match(ADD_DIR_PATTERN)
  if (!match) return null
  return match[1].replace(/\/+$/, '').trim()
}
