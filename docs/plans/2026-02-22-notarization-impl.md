# Notarization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable macOS code signing, notarization, and auto-update publishing for Manifold via electron-builder's built-in notarize support.

**Architecture:** Config-only changes — electron-builder v25+ handles signing/notarizing when env vars are present. No new npm dependencies. Auto-updater code already exists in the codebase (`src/main/index.ts:233-259`, `src/main/ipc-handlers.ts:27-33`, preload channels already whitelisted).

**Tech Stack:** electron-builder v25, Apple notarytool (via electron-builder), GitHub Actions, electron-updater (already integrated)

---

### Task 1: Create Entitlements Plist

**Files:**
- Create: `build/entitlements.mac.plist`

**Step 1: Create the entitlements file**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

Write this to `build/entitlements.mac.plist`.

**Step 2: Verify the file is valid XML**

Run: `plutil -lint build/entitlements.mac.plist`
Expected: `build/entitlements.mac.plist: OK`

**Step 3: Commit**

```bash
git add build/entitlements.mac.plist
git commit -m "feat: add hardened runtime entitlements for notarization"
```

---

### Task 2: Update electron-builder Config in package.json

**Files:**
- Modify: `package.json:44-55` (the `build.mac` and `build.dmg` sections)

**Step 1: Update the `build.mac` section**

Replace the current `mac` block:
```json
"mac": {
  "category": "public.app-category.developer-tools",
  "target": ["dmg", "zip"]
}
```

With:
```json
"mac": {
  "category": "public.app-category.developer-tools",
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": true,
  "target": [
    { "target": "dmg", "arch": ["arm64", "x64"] },
    { "target": "zip", "arch": ["arm64", "x64"] }
  ]
}
```

**Step 2: Update the `build.dmg` section**

Replace:
```json
"dmg": {
  "title": "Manifold"
}
```

With:
```json
"dmg": {
  "title": "Manifold",
  "sign": false
}
```

**Step 3: Update the `dist` script**

Replace:
```json
"dist": "electron-vite build && electron-builder --mac dmg zip"
```

With:
```json
"dist": "electron-vite build && electron-builder --mac --publish always"
```

**Step 4: Verify package.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('OK')"`
Expected: `OK`

**Step 5: Commit**

```bash
git add package.json
git commit -m "feat: configure electron-builder for code signing and notarization"
```

---

### Task 3: Update CI Workflow

**Files:**
- Modify: `.github/workflows/release-dmg.yml`

**Step 1: Replace the build and release steps**

Replace lines 33-56 (the "Build and package", "Upload build artifacts", and "Create GitHub Release" steps) with a single step:

```yaml
      - name: Build, sign, notarize, and publish
        run: npm run build && npx electron-builder --mac --publish always
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

This replaces:
- The old "Build and package" step (which used `--publish never`)
- The "Upload build artifacts" step (electron-builder publishes directly)
- The "Create GitHub Release" step (electron-builder creates the release)

**Step 2: Verify the workflow YAML is valid**

Run: `node -e "const yaml = require('fs').readFileSync('.github/workflows/release-dmg.yml','utf8'); console.log('OK: ' + yaml.split('\\n').length + ' lines')"`
Expected: OK with a line count (no parse error)

**Step 3: Commit**

```bash
git add .github/workflows/release-dmg.yml
git commit -m "feat: add signing and notarization to release workflow"
```

---

### Task 4: Run Typecheck and Tests

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: No errors (the changes are config-only, no TypeScript changes)

**Step 2: Run tests**

Run: `npm test`
Expected: All tests pass (no behavior changes)

**Step 3: Final commit if any adjustments needed**

If typecheck or tests reveal issues, fix and commit.
