# macOS Code Signing, Notarization & Auto-Update Design

**Date:** 2026-02-22
**Status:** Approved
**Approach:** electron-builder v25+ built-in notarization (config-only, no extra dependencies)

## Context

Manifold is an Electron desktop app distributed as DMG + ZIP for macOS. Currently, builds are unsigned and unnotarized, causing Gatekeeper warnings for users. This design adds code signing, Apple notarization, and auto-updates via electron-updater.

## Decisions

- **Notarization:** CI only (GitHub Actions), not local
- **Architecture:** Separate arm64 + x64 builds (not universal binary)
- **Auto-updates:** Enabled via electron-updater + GitHub Releases
- **Signing method:** electron-builder's built-in `notarize: true` (no `@electron/notarize` dependency or custom scripts)

## 1. Entitlements

**New file: `build/entitlements.mac.plist`**

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

| Entitlement | Reason |
|---|---|
| `allow-jit` | Electron V8 JIT compiler |
| `allow-unsigned-executable-memory` | V8 writable+executable memory for JIT |
| `disable-library-validation` | node-pty prebuilt `.node` addon and `spawn-helper` aren't signed with our identity |
| `allow-dyld-environment-variables` | node-pty/Electron helpers may set `DYLD_LIBRARY_PATH` |
| `network.client` | electron-updater needs outbound network for GitHub Releases |

Both `entitlements` and `entitlementsInherit` point to the same file so nested helpers (GPU, Plugin, Renderer, spawn-helper) get the same permissions.

## 2. electron-builder Config (package.json)

```json
{
  "build": {
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
    },
    "dmg": {
      "title": "Manifold",
      "sign": false
    }
  }
}
```

Changes from current config:
- `hardenedRuntime: true` — required for notarization
- `notarize: true` — electron-builder calls notarytool automatically when env vars present
- `entitlements` + `entitlementsInherit` — both point to same plist
- `target` — object syntax with explicit arm64 + x64 per target
- `gatekeeperAssess: false` — skip slow spctl check
- `dmg.sign: false` — don't double-sign the DMG container

Update `dist` script:
```json
"dist": "electron-vite build && electron-builder --mac --publish always"
```

## 3. GitHub Secrets

| Secret | Value |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` of Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | Password set when exporting the `.p12` |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |
| `GH_TOKEN` | GitHub personal access token with `repo` scope |

## 4. CI Workflow (release-dmg.yml)

Replace the build + manual upload + manual release steps with a single step:

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

electron-builder with `--publish always` uploads DMGs, ZIPs, `latest-mac.yml`, and blockmaps to a GitHub Release tagged with the version. The `upload-artifact` and `softprops/action-gh-release` steps are removed.

## 5. Auto-Update Integration

**New file: `src/main/auto-updater.ts`**

```typescript
import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:update-available', info.version)
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater:update-downloaded')
  })

  autoUpdater.checkForUpdates()
}
```

**IPC channels:**
- `updater:update-available` (push) — new version exists
- `updater:update-downloaded` (push) — download complete
- `updater:download` (invoke) — renderer requests download
- `updater:install` (invoke) — renderer requests quit-and-install

**Renderer:** Notification banner/toast when update available, with "Download" → "Restart" flow.

**Runtime flow:**
1. App launches → `autoUpdater.checkForUpdates()` hits `latest-mac.yml` on GitHub Releases
2. Newer version → pushes `updater:update-available` to renderer
3. User clicks "Download" → `autoUpdater.downloadUpdate()`
4. Download complete → pushes `updater:update-downloaded`
5. User clicks "Restart" → `autoUpdater.quitAndInstall()`

electron-updater selects the correct architecture (arm64 vs x64) from `latest-mac.yml` based on `process.arch`.

## 6. Certificate Setup (One-Time Manual Steps)

1. Export Developer ID Application certificate from Keychain Access as `.p12` (certificate + private key)
2. Base64-encode: `base64 -i Developer-ID-Application.p12 | pbcopy`
3. Create app-specific password at https://appleid.apple.com
4. Add all 6 secrets to GitHub repo (Settings → Secrets → Actions)
5. Push a version tag (`git tag v1.0.0 && git push --tags`) to trigger release

## Files Changed

| File | Change |
|---|---|
| `build/entitlements.mac.plist` | New — hardened runtime entitlements |
| `package.json` | Edit — mac targets, entitlements, notarize, dist script |
| `.github/workflows/release-dmg.yml` | Edit — signing/notarize env vars, remove manual upload/release |
| `src/main/auto-updater.ts` | New — auto-update module |
| `src/main/index.ts` | Edit — call `initAutoUpdater()` |
| `src/preload/index.ts` | Edit — expose updater IPC channels |
| Renderer component/hook | New — update notification UI |
