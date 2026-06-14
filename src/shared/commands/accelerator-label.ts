/**
 * Render an Electron accelerator string (e.g. 'CmdOrCtrl+Shift+P') as the macOS
 * glyph form (e.g. '⇧⌘P') for display in the command palette and cheat-sheet.
 * Modifiers are emitted in Apple's canonical order: ⌃ ⌥ ⇧ ⌘.
 */
const MODIFIER_GLYPHS: Record<string, string> = {
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  cmd: '⌘',
  command: '⌘',
  cmdorctrl: '⌘',
  super: '⌘',
}

const MODIFIER_ORDER = ['⌃', '⌥', '⇧', '⌘']

const KEY_GLYPHS: Record<string, string> = {
  enter: '↩',
  return: '↩',
  tab: '⇥',
  space: '␣',
  backspace: '⌫',
  delete: '⌦',
  escape: '⎋',
  esc: '⎋',
  left: '←',
  arrowleft: '←',
  right: '→',
  arrowright: '→',
  up: '↑',
  arrowup: '↑',
  down: '↓',
  arrowdown: '↓',
}

export function formatAccelerator(accelerator: string): string {
  const mods: string[] = []
  let key = ''
  for (const token of accelerator.split('+')) {
    const glyph = MODIFIER_GLYPHS[token.toLowerCase()]
    if (glyph) {
      if (!mods.includes(glyph)) mods.push(glyph)
    } else {
      key = KEY_GLYPHS[token.toLowerCase()] ?? (token.length === 1 ? token.toUpperCase() : token)
    }
  }
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return mods.join('') + key
}
