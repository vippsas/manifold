// resources/plugins/manifold.watch/src/webview/keyframes.ts
// @keyframes used by the watch styles, copied from src/renderer/styles/theme.css
// (the renderer's global stylesheet is not present in the sandboxed webview).
export const WATCH_KEYFRAMES = `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ai-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--accent-subtle); } 50% { box-shadow: 0 0 0 4px var(--accent-subtle); } }
@keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
@keyframes watch-preview-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
`
