# About Overlay Design

## Summary

Add an "About Manifold" overlay dialog accessible from the macOS app menu. Displays version, author, location, and year.

## Trigger

- Create a custom Electron `Menu` in `src/main/index.ts` with standard macOS menu structure (App, Edit, View, Window, Help).
- "About Manifold" menu item sends `show-about` IPC event to the renderer via `mainWindow.webContents.send()`.
- Renderer listens for this event and toggles `showAbout` state to display the overlay.

## Component: AboutOverlay

- File: `src/renderer/components/AboutOverlay.tsx`
- Styles: `src/renderer/components/AboutOverlay.styles.ts`
- Reuses existing modal pattern (overlay backdrop, centered panel, header with close button).
- Content: app name "Manifold" (prominent), version "v0.0.1", author "Sven Malvik", location "Norway", year "2026".
- Dismissible via: close button, click outside, Escape key.

## Layout

```
+----------------------------+
|  About Manifold          x |
+----------------------------+
|                            |
|         Manifold           |  (large title)
|         v0.0.1             |  (subtle version)
|                            |
|    Made by Sven Malvik     |
|      Norway  -  2026       |
|                            |
+----------------------------+
|                     Close  |
+----------------------------+
```

## Files

1. `src/main/index.ts` — Build custom Electron Menu template with "About Manifold" item that sends IPC to renderer.
2. `src/preload/index.ts` — Add `show-about` to the listen channel whitelist.
3. `src/renderer/components/AboutOverlay.tsx` — New component.
4. `src/renderer/components/AboutOverlay.styles.ts` — Co-located styles following project pattern.
5. `src/renderer/App.tsx` — Add `showAbout` state, IPC listener via `useEffect`, render `<AboutOverlay>`.
