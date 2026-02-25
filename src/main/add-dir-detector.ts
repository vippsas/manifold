const ADD_DIR_PATTERN = /Added\s+(\/[^\n]+?)\s+as a working directory/

export function detectAddDir(output: string): string | null {
  const match = output.match(ADD_DIR_PATTERN)
  if (!match) return null
  return match[1].replace(/\/+$/, '')
}
