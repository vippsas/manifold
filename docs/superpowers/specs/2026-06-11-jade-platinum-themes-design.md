# Jade & Platinum Theme Families — Design

**Date:** 2026-06-11
**Status:** Approved (visual companion session; user selected both candidates and approved the refined design)

## Goal

Add two new theme families — **Jade** (imperial jade & celadon) and **Platinum** (monochrome
silver & graphite) — each as a Dark + Light pair, complementary to the four existing families.

## Context

Existing accent coverage: Manifold (copper/bronze), Garfield (periwinkle blue / orange),
Neon (chartreuse / magenta), Royal (champagne gold / marine blue). Two gaps:

- **Hue:** no green-family accent (Jade fills it).
- **Saturation:** every family differentiates on hue; none on restraint (Platinum fills it —
  pure greyscale chrome where the gemstone status colors become the only color in the UI).

Both names extend the house jewelry narrative: copper → gold → jade → platinum.

## Engine constraints (from `src/shared/themes/adapter.ts`)

- `--accent` ← `focusBorder` (fallback `button.background`).
- `--accent-text` is derived: accent luminance > 0.4 → black text. Platinum Dark's silver
  accent therefore gets black button text automatically; we also set `button.foreground`
  explicitly on all four themes.
- `--status-running` ← `terminal.ansiCyan`. `--status-done/waiting/error` are fixed per mode
  (dark: `#66bb6a`/`#ffa726`/`#ef5350`; light: `#388e3c`/`#f57c00`/`#d32f2f`).
- All other UI tokens derive from the Monaco `colors` block (same key set as Royal, the most
  recent theme).

## Key decisions

1. **Jade status-collision fix.** A jade accent (~157° hue) sits between the running cyan and
   the done green. Mitigation: set `terminal.ansiCyan` distinctly bluer — `#4FB8D9` (dark),
   `#0E7FA0` (light) — so the running indicator never reads as the accent.
2. **Jade keeps house gold numerals** (`#E6B422` dark / `#9A7B12` light) and the shared
   `constant.other` green `#2D8B4E` (dark), matching Manifold/Garfield/Neon dark.
3. **Platinum syntax is pure greyscale**, read through weight and tone: keywords bold at text
   color, functions brightest, strings/numbers mid-grey, comments receding.
4. **Platinum terminal keeps functional ANSI color** (CLIs depend on red/green semantics),
   steel-tempered (desaturated toward grey-blue). The four status gemstones stay fully
   saturated — the only color in the UI.
5. **Monaco rules:** copy the rule structure of the corresponding Manifold theme (Dark for
   dark, Light for light) and recolor per the tables below. Scopes not listed in a table
   (support, markup, invalid, …) follow the same substitution by role: wherever Manifold
   uses an accent-family color, use this family's accent-family equivalent; shared colors
   (gold numerals, greens, text greys) carry over unchanged — except in Platinum, where
   accent-family substitutes are greyscale. No structural/CSS changes; theme JSON only.

## Palettes

### Jade Dark

| Role | Value |
|---|---|
| canvas / foreground | `#080C0A` / `#E6F0EA` |
| chrome (tabs, statusbar) | `#101713` |
| sidebar / input | `#060A08` / `#0E1713` |
| accent (focusBorder, button, cursors) | `#5FBF9A`, button text `#07120D` |
| borders (panel, group, indent guides) | `#1C2922` |
| selection / line highlight | `#5FBF9A33` / `#0C120E` |
| list active/inactive/hover | `#5FBF9A1F` / `#5FBF9A12` / `#5FBF9A0D` |
| description / disabled text | `#A9BFB3` / `#647A6E` |
| scrollbar | `#5FBF9A26` |
| syntax: comment | `#647A6E` |
| syntax: string, class (underline) | `#8FD9BC` |
| syntax: numeric/character | `#E6B422` (house gold) |
| syntax: keyword/storage (bold), constant.language | `#5FBF9A` |
| syntax: storage.type (italic) | `#BFC9C4` |
| syntax: function / variable | `#F0F7F3` / `#D5E3DB` |
| syntax: constant.other | `#2D8B4E` |
| ANSI (R G Y B M C W) | `#D2495F` `#43C97A` `#E6B422` `#3E7BC8` `#9C7BD8` `#4FB8D9` `#D5E3DB` |
| ANSI bright (K R G Y B M C W) | `#647A6E` `#E26A7E` `#5FD993` `#F0D693` `#6FA3E0` `#B59AE6` `#7FD0E8` `#F0F7F3` |
| terminal black / selection | `#080C0A` / `#5FBF9A40` |

### Jade Light

| Role | Value |
|---|---|
| canvas / foreground | `#F8FBF8` / `#1A2620` |
| chrome | `#EAF2EC` |
| sidebar / input | `#F0F6F1` / `#FFFFFF` |
| accent | `#1E6B4F`, button text `#FFFFFF` |
| borders | `#D8E4DC` |
| selection / line highlight | `#1E6B4F2E` / `#EFF6F1` |
| list active/inactive/hover | `#1E6B4F1F` / `#1E6B4F12` / `#1E6B4F0D` |
| description / disabled text | `#5A6E62` / `#8FA096` |
| scrollbar | `#1E6B4F26` |
| syntax: comment | `#8FA096` |
| syntax: string, class (underline), constant.other | `#2D7A45` |
| syntax: numeric | `#9A7B12` |
| syntax: keyword/storage (bold), constant.language | `#1E6B4F` |
| syntax: storage.type (italic) | `#4A6B58` |
| syntax: function / variable | `#10160F` / `#243A30` |
| ANSI (R G Y B M C W) | `#C03548` `#2D7A45` `#9A7B12` `#2563A8` `#7C4FB0` `#0E7FA0` `#6B7A72` |
| ANSI bright (K R G Y B M C W) | `#8FA096` `#D2495F` `#3E8E5A` `#B8941E` `#3E7BC8` `#9C6FD0` `#2E9FBE` `#1A2620` |
| terminal black / selection | `#1A2620` / `#1E6B4F40` |

### Platinum Dark

| Role | Value |
|---|---|
| canvas / foreground | `#0A0A0C` / `#E8E9ED` |
| chrome | `#141416` |
| sidebar / input | `#08080A` / `#101013` |
| accent | `#C8CDD6` (polished silver), button text `#0A0A0C` |
| borders | `#222328` |
| selection / line highlight | `#C8CDD633` / `#101013` |
| list active/inactive/hover | `#C8CDD61A` / `#C8CDD610` / `#C8CDD60D` |
| description / disabled text | `#A9ACB4` / `#5F636C` |
| scrollbar | `#C8CDD626` |
| syntax: comment | `#5F636C` |
| syntax: string, constant.other | `#AEB6C2` |
| syntax: numeric, constant.language | `#C8CDD6` |
| syntax: keyword/storage (bold) | `#E8E9ED` |
| syntax: storage.type (italic) | `#C0C3CB` |
| syntax: class (underline) | `#DEE1E7` |
| syntax: function / variable | `#FFFFFF` / `#D4D6DC` |
| ANSI (R G Y B M C W) | `#C96670` `#6FBE8E` `#C9B473` `#7C9DC9` `#A98FC9` `#4AC9C9` `#E8E9ED` |
| ANSI bright (K R G Y B M C W) | `#5F636C` `#DB8490` `#8DD3A8` `#DCCB90` `#9AB8DE` `#C2ABDE` `#6FDADA` `#FFFFFF` |
| terminal black / selection | `#0A0A0C` / `#C8CDD640` |

### Platinum Light

| Role | Value |
|---|---|
| canvas / foreground | `#FAFAFB` / `#25272D` |
| chrome | `#ECECEF` |
| sidebar / input | `#F2F2F4` / `#FFFFFF` |
| accent | `#3A4150` (graphite), button text `#FFFFFF` |
| borders | `#DCDDE1` |
| selection / line highlight | `#3A415026` / `#F1F1F4` |
| list active/inactive/hover | `#3A41501A` / `#3A415010` / `#3A41500D` |
| description / disabled text | `#5C6068` / `#9A9DA6` |
| scrollbar | `#3A415026` |
| syntax: comment | `#9A9DA6` |
| syntax: string, constant.other | `#565E6E` |
| syntax: numeric, constant.language | `#3A4150` |
| syntax: keyword/storage (bold) | `#25272D` |
| syntax: storage.type (italic) | `#4A4F5A` |
| syntax: class (underline) | `#3C434F` |
| syntax: function / variable | `#0E0F12` / `#32353D` |
| ANSI (R G Y B M C W) | `#B5454F` `#3E8E5A` `#8A7A2E` `#4A6FA5` `#7A5FA0` `#2E8FA8` `#555E66` |
| ANSI bright (K R G Y B M C W) | `#9A9DA6` `#C96670` `#5AA878` `#A8954A` `#6E8FC0` `#9A7FC0` `#4AAFC8` `#0E0F12` |
| terminal black / selection | `#25272D` / `#3A415040` |

## Implementation scope (mirrors Royal PR #419)

1. `src/shared/themes/data/` — four new JSONs: `Jade Dark`, `Jade Light`, `Platinum Dark`,
   `Platinum Light` (Monaco format: `base`, `inherit`, ~66 `rules`, `colors` with the same
   key set as Royal).
2. `src/shared/themes/theme-data.ts` — four imports + entries in `themeDataByLabel` and
   `themeList` (ids: `jade-dark`, `jade-light`, `platinum-dark`, `platinum-light`).
3. `src/renderer/App.tsx` — extend the `themeFamily` union and derivation with
   `jade` and `platinum`.
4. `src/renderer/AppShell.tsx` — widen the prop union.
5. `src/renderer/components/TitleBar.tsx` — add both families to the dropdown list.
6. `src/shared/themes/registry.test.ts` — add the four ids.

No CSS or structural changes. The ☀/☾ titlebar toggle handles each pair automatically
(`-dark` ↔ `-light` id swap).

## Verification

- `registry.test.ts` passes with the four new ids.
- `npm run typecheck:web` / `typecheck:node` stay at baseline (37 / 12) with zero new errors.
- Run all four JSONs through `convertTheme`: accent, `--accent-text` (Platinum Dark must
  resolve to black-on-silver), and `--status-running` (Jade must get the bluer cyan) resolve
  as designed.
- Visual smoke check in the running app: titlebar Themes → Jade / Platinum, toggle ☀/☾.
