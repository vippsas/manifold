// Each runtime announces an added folder in its own words.
const ADD_DIR_PATTERNS = [
  /Added\s+(\/[^\n]+?)\s+as a working directory/,          // Claude Code
  /Added directory to allowed list:\s+(\/[^\n\r]+?)\s*[\r\n]/, // Copilot CLI
]
// Cursor movement must become spaces, not be stripped: a TUI places each word at
// a column rather than emitting the spaces between them, so stripping these
// joins the words ("Addedas a working directory") and no pattern can match.
// \x1b[nC = forward, \x1b[nG = column, \x1b[r;cH = position.
const CURSOR_MOVES = /\x1b\[\d*(?:;\d+)?[CGH]/g
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g

export function detectAddDir(output: string): string | null {
  const clean = output.replace(CURSOR_MOVES, ' ').replace(ANSI_ESCAPE, '')
  for (const pattern of ADD_DIR_PATTERNS) {
    const match = clean.match(pattern)
    if (match) return match[1].replace(/\/+$/, '').trim()
  }
  return null
}
