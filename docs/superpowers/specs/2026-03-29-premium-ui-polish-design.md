# Premium UI Polish — Design Spec

**Goal:** Elevate Manifold's visual quality to match the Jacob & Co luxury watch aesthetic established in the theme, going beyond colors into surface depth, interaction quality, and visual hierarchy.

**Context:** The Jacob Co Dark theme (palette, shadows, accent colors) is already implemented. This spec covers structural CSS and component refinements that make the UI feel premium regardless of which theme is active.

---

## 1. Surface Depth Hierarchy (Brushed Metal Gradients)

Micro-gradients on chrome surfaces (title bar, status bar, tab bar) to simulate brushed metal depth.

```css
background: linear-gradient(180deg, var(--bg-chrome-hi), var(--bg-chrome-lo));
```

Already have `--bg-chrome-hi` and `--bg-chrome-lo` tokens in the adapter. Apply them to:
- Tab bar container (`.dv-tabs-container`)
- Status bar (`.status-bar`)
- Panel headers

## 2. Gradient Buttons

Rose gold gradient with directional lighting on hover.

```css
.btn-primary {
  background: linear-gradient(135deg, var(--btn-bg), var(--btn-hover));
  transition: filter 200ms ease;
}
.btn-primary:hover {
  filter: brightness(1.1);
}
```

Applies to: Save button in settings, New Agent button, PR creation button, all primary action buttons.

## 3. Focus Ring Glow

Soft accent-colored glow instead of hard browser outline.

```css
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-subtle), 0 0 12px var(--accent-subtle);
}
```

## 4. Modal Backdrop Blur

Frosted glass effect behind overlays and modals.

```css
.modal-backdrop {
  backdrop-filter: blur(12px);
  background: var(--overlay-backdrop);
}
```

## 5. Scrollbar Refinement

Thinner, rounded scrollbars with accent-tinted hover.

```css
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--scrollbar-thumb);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--accent-dim);
}
```

## 6. Border Refinement

Replace flat gray borders with very low opacity accent tint for warmth.

```css
border-color: var(--border); /* adapter already produces accent-tinted borders for Jacob Co Dark */
```

Ensure all hardcoded border colors use the `--border` or `--divider` tokens.

## 7. Tab Active Indicator

Bottom accent-colored bar on active tab (like a watch bezel marker).

```css
.dv-tab.dv-activegroup .dv-default-tab-content {
  border-bottom: 2px solid var(--accent);
}
```

## 8. Status Bar Polish

Subtle top border gradient, slightly smaller text, brushed metal gradient.

```css
.status-bar {
  background: linear-gradient(180deg, var(--bg-chrome-hi), var(--bg-chrome-lo));
  border-top: 1px solid var(--divider);
  font-size: 11px;
}
```

## 9. File Tree Hover

Smooth transition with accent-tinted background.

```css
.file-tree-item:hover {
  background: var(--tree-hover);
  transition: background 150ms ease;
}
```

## 10. Dual Accent System

Use white gold (`#E8DFD1`) as secondary accent for less prominent interactive elements. The primary accent (rose gold) is for CTAs and active states. Secondary accent is for:
- Hover states on non-primary buttons
- Secondary badges
- Subtle highlights

Requires adding `--accent-secondary` token to the adapter.

## 11. Typography Refinement

Slightly increased letter-spacing on headings, lighter font weight on labels.

```css
.panel-header { letter-spacing: 0.02em; }
.label, .caption { font-weight: 400; opacity: 0.7; }
```

## 12. Micro-Interactions

Smooth transitions on interactive elements (200ms ease).

```css
* { transition: background 150ms ease, box-shadow 150ms ease, border-color 150ms ease; }
```

Apply selectively to interactive elements, not globally.

## 13. Subtle Noise Texture

Faint grain overlay on dark surfaces for depth (like watch dial texture). Lower priority — can be achieved with a tiny repeating SVG pattern at very low opacity.

## 14. Sidebar Repository & Agent List Cleanup

**Current problems:**
- Flat, unstyled list — repos and agents blur together visually
- No visual grouping between repository sections
- Active selection (yellow-green border) looks harsh and dated
- Agent items lack visual containment — status dot, name, and metadata feel scattered
- Too much vertical space with no visual rhythm
- No distinction between repos with agents vs. empty repos

### A. Visual Grouping Per Repository

Add micro-gap between repository groups. Repos with active agents get a subtle card-like container with `var(--bg-elevated)` background and rounded corners. Empty repos get a quieter, condensed single-line treatment.

### B. Active Selection Refinement

Replace the solid border selection with a subtle left accent bar (2-3px) + soft tinted background:
- Active repo: left bar in `var(--accent)` + `var(--accent-subtle)` fill
- Active agent: slightly brighter tinted background within the repo group

### C. Agent Item Card Treatment

Each agent gets a contained row with rounded corners, slight inset padding, and `var(--bg-input)` background:
- Status dot + branch name on one line, runtime badge right-aligned
- Task description as secondary text below, truncated with ellipsis
- Subtle left border colored by status (green=running, amber=waiting, etc.)

### D. Repository Header Treatment

Repo names get slightly smaller, uppercase letter-spacing (watch dial label style). Or: keep current weight but add a thin bottom divider within the group.

### E. Hover and Interaction Polish

- Smooth 150ms transition on hover backgrounds
- Hover reveals action buttons with a fade-in (opacity transition), not abrupt show/hide
- Agent hover slightly lifts the card (1px translateY + shadow)

### F. Empty State for Repos Without Agents

Dimmed text or italic style for repos with no active sessions. Optionally collapse them into an "Other repositories" section at the bottom.

---

## Implementation Priority

**Phase 1 — Biggest visual impact, CSS-only:**
1. Surface gradients (#1) + border refinement (#6)
2. Gradient buttons (#2) + focus glow (#3)
3. Scrollbar refinement (#5) + backdrop blur (#4)

**Phase 2 — Component polish:**
4. Tab active indicator (#7) + status bar (#8)
5. Micro-interactions (#12) + file tree hover (#9)
6. Typography (#11)

**Phase 3 — Sidebar overhaul:**
7. Sidebar list cleanup (#14) — grouping, selection, agent cards

**Phase 4 — Nice-to-have:**
8. Dual accent system (#10)
9. Noise texture (#13)
