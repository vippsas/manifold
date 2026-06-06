// resources/plugins/manifold.loop/src/webview/keyframes.ts
// @keyframes used by the loop styles, copied from src/renderer/styles/theme.css (the renderer's
// global stylesheet is not present in the sandboxed webview).
export const LOOP_KEYFRAMES = `
@keyframes dot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ai-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--accent-subtle); } 50% { box-shadow: 0 0 0 4px var(--accent-subtle); } }
@keyframes loop-progress-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
`
