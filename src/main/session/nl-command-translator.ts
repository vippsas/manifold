export type NlBufferResult =
  | { type: 'accumulate' }
  | { type: 'passthrough' }
  | { type: 'nl-query'; query: string; pasted: boolean }

/**
 * Buffers keystrokes for a shell session and detects `# <text>` NL queries.
 * Call `feed()` with each chunk of input. When it returns `nl-query`, the
 * input should be intercepted (not forwarded to PTY). When it returns
 * `passthrough`, forward the entire buffered line + Enter to the PTY.
 *
 * The `pasted` flag on `nl-query` indicates whether the entire line arrived
 * in a single feed() call (paste) vs character-by-character (typing). When
 * pasted, the caller must echo the text to the PTY since it was never
 * forwarded during accumulate.
 */
export class NlInputBuffer {
  private buffer = ''
  private hadAccumulate = false

  feed(data: string): NlBufferResult {
    for (const char of data) {
      if (char === '\r' || char === '\n') {
        const line = this.buffer
        const pasted = !this.hadAccumulate
        this.buffer = ''
        this.hadAccumulate = false
        return this.classifyLine(line, pasted)
      }
      if (char === '\x7f') {
        // Backspace
        this.buffer = this.buffer.slice(0, -1)
        continue
      }
      if (char === '\x15') {
        // Ctrl+U: kill line
        this.buffer = ''
        continue
      }
      this.buffer += char
    }
    this.hadAccumulate = true
    return { type: 'accumulate' }
  }

  hasBufferedInput(): boolean {
    return this.buffer.length > 0
  }

  private classifyLine(line: string, pasted: boolean): NlBufferResult {
    // Must start with "# " (hash + space) to trigger NL mode
    if (!line.startsWith('# ')) return { type: 'passthrough' }
    const query = line.slice(2).trim()
    if (!query) return { type: 'passthrough' }
    return { type: 'nl-query', query, pasted }
  }
}

/**
 * Strip ANSI/VT100 escape sequences from terminal output for AI context.
 * Simpler than the chat-adapter version — we just need readable text.
 */
export function stripAnsiForContext(text: string): string {
  return text
    // OSC sequences: ESC ] ... (ST | BEL)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // CSI sequences: ESC [ ... final byte
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Other escape sequences: ESC followed by one character
    .replace(/\x1b[^[\]]/g, '')
    // Remaining control characters except newline/tab
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
}

const DEFAULT_MAX_LINES = 50

/**
 * Rolling buffer that keeps the last N lines of plain-text terminal output.
 * ANSI sequences are stripped on append. Used to provide context to the AI
 * when translating natural language commands.
 */
export class RollingOutputBuffer {
  private lines: string[] = []
  private partial = ''

  constructor(private maxLines = DEFAULT_MAX_LINES) {}

  append(data: string): void {
    const clean = stripAnsiForContext(data)
    const text = this.partial + clean
    const parts = text.split('\n')
    // Last element is either empty (if data ended with \n) or a partial line
    this.partial = parts.pop() ?? ''

    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed) continue
      this.lines.push(trimmed)
    }

    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(-this.maxLines)
    }
  }

  getLines(): string[] {
    return [...this.lines]
  }

  getText(): string {
    return this.lines.join('\n')
  }
}

export interface NlTranslationContext {
  query: string
  terminalOutput: string
  cwd: string
  gitStatus: string
  os: string
  shell: string
}

/**
 * Build the AI prompt for translating a natural language request into a shell command.
 */
export function buildNlTranslationPrompt(ctx: NlTranslationContext): string {
  const output = ctx.terminalOutput || '(no recent output)'
  const git = ctx.gitStatus || '(not a git repository)'

  return `You are a shell command translator. Convert the user's natural language request into a single shell command. Use the recent terminal output for context (e.g. error messages, previous commands).

Reply with ONLY the shell command. No explanation, no markdown, no backticks, no quotes.
If you cannot determine a single command, reply with a comment starting with #.

OS: ${ctx.os}
Shell: ${ctx.shell}
Working directory: ${ctx.cwd}

Git status:
${git}

Recent terminal output:
${output}

User request: ${ctx.query}

Command:`
}
