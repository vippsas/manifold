export interface ActiveMention {
  /** Index of the triggering `@`. */
  start: number
  /** Cursor position (exclusive end of the query). */
  end: number
  /** Text typed after the `@`, up to the cursor. */
  query: string
}

/**
 * Find the `@mention` token the cursor is currently editing, if any. A mention
 * starts at an `@` that sits at the start of the input or after whitespace, and
 * runs up to the cursor without containing whitespace.
 */
export function findActiveMention(text: string, cursor: number): ActiveMention | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const char = text[i]
    if (char === '@') {
      const prev = text[i - 1]
      if (i === 0 || /\s/.test(prev)) {
        return { start: i, end: cursor, query: text.slice(i + 1, cursor) }
      }
      return null
    }
    if (/\s/.test(char)) return null
  }
  return null
}

/** Replace the active mention token with `@path ` and report the new cursor. */
export function applyMention(text: string, mention: ActiveMention, path: string): { text: string; cursor: number } {
  const insert = `@${path} `
  const next = text.slice(0, mention.start) + insert + text.slice(mention.end)
  return { text: next, cursor: mention.start + insert.length }
}

/** Insert `@path ` at the cursor, adding a leading space when needed (used for drops). */
export function insertMentionAtCursor(text: string, cursor: number, path: string): { text: string; cursor: number } {
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : ''
  const insert = `${leadingSpace}@${path} `
  return { text: before + insert + after, cursor: before.length + insert.length }
}

export interface ActiveCommand {
  /** Index of the triggering `/` (always 0 — commands only start a message). */
  start: number
  /** Cursor position (exclusive end of the query). */
  end: number
  /** Text typed after the `/`, up to the cursor. */
  query: string
}

/**
 * Find the `/command` token the cursor is editing, if any. A command trigger is
 * only valid at the very start of the message and runs up to the cursor without
 * containing whitespace — once a space is typed the command has arguments and we
 * stop suggesting. Claude Code expands `/command` natively when the message sends.
 */
export function findActiveCommand(text: string, cursor: number): ActiveCommand | null {
  if (text[0] !== '/') return null
  const query = text.slice(1, cursor)
  if (/\s/.test(query)) return null
  return { start: 0, end: cursor, query }
}

/** Replace the active command token with `/name ` and report the new cursor. */
export function applyCommand(text: string, command: ActiveCommand, name: string): { text: string; cursor: number } {
  const insert = `/${name} `
  const next = text.slice(0, command.start) + insert + text.slice(command.end)
  return { text: next, cursor: command.start + insert.length }
}

/** Rank commands against the query: name-prefix, then name after a `plugin:` namespace, then substring. */
export function rankCommands(commands: string[], query: string, limit: number): string[] {
  if (!query) return commands.slice(0, limit)
  const q = query.toLowerCase()
  const scored: { command: string; score: number }[] = []
  for (const command of commands) {
    const lower = command.toLowerCase()
    const name = lower.slice(lower.lastIndexOf(':') + 1)
    let score = -1
    if (lower.startsWith(q)) score = 0
    else if (name.startsWith(q)) score = 1
    else if (lower.includes(q)) score = 2
    if (score >= 0) scored.push({ command, score })
  }
  scored.sort((a, b) => a.score - b.score || a.command.length - b.command.length || a.command.localeCompare(b.command))
  return scored.slice(0, limit).map((s) => s.command)
}

/** Rank candidate paths against the query: basename-prefix, then basename, then full-path matches. */
export function rankMentionPaths(paths: string[], query: string, limit: number): string[] {
  if (!query) return paths.slice(0, limit)
  const q = query.toLowerCase()
  const scored: { path: string; score: number }[] = []
  for (const path of paths) {
    const lower = path.toLowerCase()
    const base = lower.slice(lower.lastIndexOf('/') + 1)
    let score = -1
    if (base.startsWith(q)) score = 0
    else if (base.includes(q)) score = 1
    else if (lower.includes(q)) score = 2
    if (score >= 0) scored.push({ path, score })
  }
  scored.sort((a, b) => a.score - b.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
  return scored.slice(0, limit).map((s) => s.path)
}
