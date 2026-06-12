// resources/plugins/manifold.loop/src/webview/keyframes.ts
// Global CSS the sandboxed webview lacks, copied from src/renderer/styles/theme.css:
// the @keyframes the loop styles reference, plus the targeting-reticle focus rule.
export const LOOP_KEYFRAMES = `
@keyframes dot-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes ai-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--accent-subtle); } 50% { box-shadow: 0 0 0 4px var(--accent-subtle); } }
@keyframes loop-progress-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
`

// Targeting-reticle focus: text fields swap their plain accent border for four
// accent corner brackets. !important mirrors the renderer rule — it overrides the
// inputs' inline `background`/`border` so the bracket layers aren't reset.
export const LOOP_INPUT_RETICLE = `
input:focus,
textarea:focus {
  border-color: transparent !important;
  background-image:
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)),
    linear-gradient(var(--accent), var(--accent)) !important;
  background-repeat: no-repeat !important;
  background-origin: border-box !important;
  background-clip: border-box !important;
  background-size:
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px,
    12px 1.5px, 1.5px 12px !important;
  background-position:
    left top, left top,
    right top, right top,
    left bottom, left bottom,
    right bottom, right bottom !important;
}
`
