// Claude Code paints its own colors — it does not use the terminal's ANSI
// palette by default, so Manifold's theme can't recolor it. Its "ANSI colors
// only" themes (`light-ansi` / `dark-ansi`) are the exception: they render
// through the terminal's 16-color palette, letting Manifold's themed palette
// control Claude Code's output. We launch the embedded Claude Code with the
// variant matching Manifold's current light/dark theme via its `--settings`
// flag (a high-precedence merge layer, so the user's other settings are kept).

export function claudeAnsiThemeArgs(themeType: 'light' | 'dark'): string[] {
  const theme = themeType === 'light' ? 'light-ansi' : 'dark-ansi'
  return ['--settings', JSON.stringify({ theme })]
}
