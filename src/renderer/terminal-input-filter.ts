// Filters out terminal response sequences that xterm.js auto-generates
// (e.g. OSC color queries, cursor position reports, focus events) so they
// don't leak into the shell PTY as garbled input.

// OSC 10/11 color responses: \x1b]1[01];rgb:RRRR/GGGG/BBBB followed by ST (\x1b\\ or \x07)
const oscColorResponse = /\x1b\]1[01];rgb:[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}\/[0-9a-fA-F]{4}(?:\x1b\\|\x07)/g

// Cursor Position Report (CPR): \x1b[row;colR
const cursorPositionReport = /\x1b\[\d+;\d+R/g

// Focus events: \x1b[I (focus in) and \x1b[O (focus out)
const focusEvent = /\x1b\[[IO]/g

/**
 * Strip known terminal response sequences from xterm.js onData output.
 * Returns the cleaned string, or `null` if the entire input consisted
 * of response sequences (so the caller can skip the IPC call entirely).
 */
export function filterTerminalResponses(data: string): string | null {
  const filtered = data
    .replace(oscColorResponse, '')
    .replace(cursorPositionReport, '')
    .replace(focusEvent, '')

  return filtered.length > 0 ? filtered : null
}
