import { useEffect, useRef, useState } from 'react'

export interface ThemeChangeNotice {
  show: boolean
  mode: 'light' | 'dark'
  dismiss: () => void
}

const AUTO_DISMISS_MS = 8000

// The embedded Claude Code's theme is fixed at launch (see
// src/main/agent/claude-theme-args.ts), so toggling light↔dark does NOT
// re-theme an already-running interactive agent — only newly launched agents
// pick up the new colors. Announce that once, on the switch, so the user
// isn't confused when the running agent keeps its old colors.
export function useThemeChangeNotification(
  themeType: 'light' | 'dark',
  interactiveAgentActive: boolean,
): ThemeChangeNotice {
  const prevType = useRef(themeType)
  const [show, setShow] = useState(false)

  useEffect(() => {
    const changed = prevType.current !== themeType
    prevType.current = themeType
    if (changed && interactiveAgentActive) setShow(true)
  }, [themeType, interactiveAgentActive])

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => setShow(false), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [show])

  return { show, mode: themeType, dismiss: () => setShow(false) }
}
