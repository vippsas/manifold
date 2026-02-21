# macOS Icon Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create and integrate a macOS `.icns` icon featuring the Manifold ghost in chartreuse on black.

**Architecture:** Create a master SVG at 1024x1024, export PNGs at all macOS icon sizes using `sips`, package into `.icns` using `iconutil`, and place at `build/icon.icns` where electron-builder auto-discovers it.

**Tech Stack:** SVG, sips (macOS), iconutil (macOS), electron-builder

---

### Task 1: Create the build directory and master SVG

**Files:**
- Create: `build/icon.svg`

**Step 1: Create the build directory**

```bash
mkdir -p build
```

**Step 2: Create the master SVG**

Create `build/icon.svg` with the following content. This is a 1024x1024 SVG with:
- A `#0A0A0A` rounded rectangle background (18.75% corner radius = 192px)
- A `#CCFF00` ghost shape faithfully reproducing the ASCII art ghost
- Eyes and mouth cut out as negative space via SVG mask

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- macOS rounded-rect background -->
  <rect width="1024" height="1024" rx="192" ry="192" fill="#0A0A0A"/>

  <defs>
    <mask id="ghost-cutouts">
      <!-- White = visible, black = cut out -->
      <rect width="1024" height="1024" fill="white"/>
      <!-- Left eye -->
      <circle cx="410" cy="440" r="52" fill="black"/>
      <!-- Right eye -->
      <circle cx="614" cy="440" r="52" fill="black"/>
      <!-- Mouth (curved smile) -->
      <path d="M 430 540 Q 512 610 594 540 Q 570 580 512 590 Q 454 580 430 540 Z" fill="black"/>
    </mask>
  </defs>

  <!-- Ghost body with cutouts -->
  <path mask="url(#ghost-cutouts)" fill="#CCFF00" d="
    M 512 180
    C 340 180 260 310 260 440
    L 260 700
    Q 260 740 290 740
    Q 320 710 350 740
    Q 380 770 410 740
    Q 440 710 470 740
    Q 500 770 530 740
    Q 560 710 590 740
    Q 620 770 650 740
    Q 680 710 710 740
    Q 740 770 764 740
    L 764 440
    C 764 310 684 180 512 180
    Z
  "/>
</svg>
```

**Step 3: Verify the SVG renders correctly**

```bash
open build/icon.svg
```

Visually confirm: chartreuse ghost with dome head, two round eyes, curved smile, wavy bottom edge, all on a black rounded-rect background.

**Step 4: Commit**

```bash
git add build/icon.svg
git commit -m "feat: add master SVG icon with ghost design"
```

---

### Task 2: Generate PNG icon set from SVG

**Files:**
- Create: `build/icon.iconset/` directory with all required PNGs

**Step 1: Create the iconset directory**

```bash
mkdir -p build/icon.iconset
```

**Step 2: Export 1024x1024 base PNG from SVG**

Use `sips` to convert SVG to PNG:

```bash
sips -s format png build/icon.svg --out build/icon.iconset/icon_512x512@2x.png --resampleWidth 1024 --resampleHeight 1024
```

If `sips` can't handle SVG directly, use the `qlmanage` fallback:

```bash
qlmanage -t -s 1024 -o build/icon.iconset/ build/icon.svg
mv build/icon.iconset/icon.svg.png build/icon.iconset/icon_512x512@2x.png
```

**Step 3: Generate all required sizes from the 1024px PNG**

```bash
sips -z 512 512 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_512x512.png
sips -z 512 512 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_256x256@2x.png
sips -z 256 256 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_256x256.png
sips -z 256 256 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_128x128@2x.png
sips -z 128 128 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_128x128.png
sips -z 64 64 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_32x32@2x.png
sips -z 32 32 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_32x32.png
sips -z 32 32 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_16x16@2x.png
sips -z 16 16 build/icon.iconset/icon_512x512@2x.png --out build/icon.iconset/icon_16x16.png
```

**Step 4: Verify all 10 files exist with correct sizes**

```bash
ls -la build/icon.iconset/
```

Expected: 10 PNG files ranging from 16x16 to 1024x1024.

**Step 5: Commit**

```bash
git add build/icon.iconset/
git commit -m "feat: generate PNG icon set at all macOS sizes"
```

---

### Task 3: Package into .icns and verify

**Files:**
- Create: `build/icon.icns`

**Step 1: Convert iconset to icns**

```bash
iconutil --convert icns build/icon.iconset --output build/icon.icns
```

**Step 2: Verify the .icns file was created**

```bash
ls -la build/icon.icns
```

Expected: a file of ~200-500KB.

**Step 3: Preview the icon**

```bash
open build/icon.icns
```

Visually confirm the icon renders correctly at multiple sizes in Preview.app.

**Step 4: Commit**

```bash
git add build/icon.icns
git commit -m "feat: package macOS icon as .icns"
```

---

### Task 4: Clean up and verify electron-builder integration

**Step 1: Verify electron-builder will find the icon**

electron-builder automatically looks for `build/icon.icns` on macOS. No `package.json` changes needed. Verify the path convention is correct:

```bash
grep -r "icon" package.json || echo "No explicit icon config - electron-builder uses build/icon.icns by convention"
```

**Step 2: Test the build picks up the icon**

```bash
npm run build
```

Expected: build succeeds without icon-related warnings.

**Step 3: Clean up the iconset directory (optional)**

The `.iconset/` directory is only needed for the `iconutil` conversion. Add it to `.gitignore` if desired, or keep it for future regeneration.

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: integrate macOS ghost icon for Manifold"
```
