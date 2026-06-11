// ── Color helpers ──────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = amount / 100
  return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f)
}

export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const f = amount / 100
  return rgbToHex(r * (1 - f), g * (1 - f), b * (1 - f))
}

export function withOpacity(hex: string, opacity: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/** Convert hex to HSL: hue in degrees [0, 360), saturation and lightness as 0–1 fractions. */
export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return [h, s, l]
}

export function normalizeHex(color: string | undefined): string | undefined {
  if (!color) return undefined
  if (!color.startsWith('#')) return undefined // non-hex (rgb, named, etc.) — skip
  const c = color.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(c)) return undefined
  // Strip alpha channel for hex-manipulation functions (lighten/darken/luminance)
  if (c.length === 8) return '#' + c.slice(0, 6)
  if (c.length === 4) return '#' + c.slice(0, 3)
  return '#' + c
}

/** Return a CSS-safe color value, preserving alpha from 8-digit hex (#RRGGBBAA). */
export function normalizeCssColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  if (!color.startsWith('#')) return color // non-hex (rgb, named, etc.) — pass through as CSS
  const c = color.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(c)) return color // malformed hex — pass through
  if (c.length === 8) {
    const r = parseInt(c.slice(0, 2), 16)
    const g = parseInt(c.slice(2, 4), 16)
    const b = parseInt(c.slice(4, 6), 16)
    const a = parseInt(c.slice(6, 8), 16) / 255
    if (a >= 0.996) return '#' + c.slice(0, 6) // fully opaque
    return `rgba(${r}, ${g}, ${b}, ${+(a.toFixed(3))})`
  }
  if (c.length === 4) return '#' + c.slice(0, 3)
  return '#' + c
}
