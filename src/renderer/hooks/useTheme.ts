import { useState, useEffect, useMemo } from 'react'
import type { ITheme } from '@xterm/xterm'
import { loadTheme, migrateLegacyTheme } from '../../shared/themes/registry'
import { applyThemeCssVars } from '../../shared/themes/adapter'
import { loader } from '@monaco-editor/react'

interface ThemeResult {
  themeId: string
  themeClass: string
  xtermTheme: ITheme
  previewThemeId: string | null
  setPreviewThemeId: (id: string | null) => void
}

export function useTheme(settingsTheme: string): ThemeResult {
  const themeId = useMemo(() => migrateLegacyTheme(settingsTheme), [settingsTheme])
  const currentTheme = useMemo(() => loadTheme(themeId), [themeId])
  const themeClass = currentTheme.type === 'light' ? 'theme-light' : 'theme-dark'

  useEffect(() => {
    applyThemeCssVars(currentTheme.cssVars)

    void loader.init().then((monaco) => {
      monaco.editor.defineTheme(themeId, currentTheme.monacoTheme as Parameters<typeof monaco.editor.defineTheme>[1])
      monaco.editor.setTheme(themeId)
    })

    window.electronAPI.send('theme:changed', {
      type: currentTheme.type,
      background: currentTheme.cssVars['--bg-primary'],
    })
  }, [themeId, currentTheme])

  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)

  const xtermTheme: ITheme = previewThemeId
    ? loadTheme(previewThemeId).xtermTheme
    : currentTheme.xtermTheme

  return { themeId, themeClass, xtermTheme, previewThemeId, setPreviewThemeId }
}
