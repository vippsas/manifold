# macOS Icon Design

## Overview

Create a macOS application icon for Manifold featuring the ghost character from the ASCII logo in the onboarding view.

## Design

**Ghost shape** (vector translation of the ASCII art):

```
  .--.       -> rounded dome top
 / oo \      -> two circular eyes (negative space)
| \__/ |     -> curved smile/mouth (negative space)
 \    /      -> tapered body
  \__/       -> wavy/scalloped bottom edge
```

**Colors**:
- Background: `#0A0A0A` (black), rounded rectangle with ~18.5% corner radius (macOS standard)
- Ghost: `#CCFF00` (chartreuse), solid fill
- Eyes and mouth: cut out as negative space revealing the black background

## Deliverables

- `build/icon.svg` — master 1024x1024 SVG
- `build/icon.icns` — macOS icon bundle containing all required sizes

**Sizes** (macOS `.icns` standard):
16x16, 32x32 (16@2x), 64x64 (32@2x), 128x128, 256x256 (128@2x), 512x512, 1024x1024 (512@2x)

## Pipeline

1. Create master SVG with ghost on rounded-rect background
2. Export PNGs at all sizes via `sips` (built into macOS)
3. Package into `.icns` via `iconutil` (built into macOS)
4. Place at `build/icon.icns` — electron-builder auto-discovers this path

## Integration

No `package.json` changes needed. electron-builder uses `build/icon.icns` by convention.
