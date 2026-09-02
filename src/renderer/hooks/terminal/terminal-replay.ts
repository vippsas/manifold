// Sanitizes a session's buffered output before it is replayed into a freshly
// created xterm.js instance.
//
// xterm.js answers the terminal queries it finds in the stream it is given: an
// `ESC[6n` makes it emit `ESC[<row>;<col>R` and an `ESC[c` makes it emit
// `ESC[?1;2c`, both through `onData`, which the terminal hook forwards to the
// live PTY as though the user had typed it. That is correct for live output, but
// the replay buffer is *history* — every query in it was already answered by
// whichever terminal was attached when the program sent it. Re-answering them on
// every view switch types stale reports into the running program: a burst whose
// tails surface as `;1R;1R;1R;1R` at a prompt. Both runtimes seed a buffer with
// these — codex sends one cursor query on startup and one per resize, and codex
// and Claude Code each send one device-attributes query on startup.
//
// Only the replay is filtered. Live output still gets its answer, so a TUI that
// queries the cursor while its terminal is attached (the GitHub CLI auth prompt)
// does not hang — see `terminal-input-filter.ts`, which deliberately passes CPR
// through on the way to the PTY. The OSC 10/11 color queries codex also sends
// need no stripping here: that filter already drops their replies.
const answeredQueries = [
  // DSR cursor position report, and its DEC private form (reply: ESC[<r>;<c>R).
  /\x1b\[\??6n/g,
  // Primary device attributes (reply: ESC[?1;2c). xterm only answers Ps 0.
  /\x1b\[0?c/g,
  // Secondary device attributes (reply: ESC[>0;276;0c). Same, Ps 0 only.
  /\x1b\[>0?c/g,
]

/** Drop the queries xterm.js auto-answers, so replayed output isn't answered twice. */
export function stripTerminalQueries(buffer: string): string {
  return answeredQueries.reduce((data, query) => data.replace(query, ''), buffer)
}
