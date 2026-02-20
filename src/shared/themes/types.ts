import type { ITheme } from '@xterm/xterm'

export interface ThemeMeta {
  id: string
  label: string
  type: 'dark' | 'light'
}

export interface ConvertedTheme {
  cssVars: Record<string, string>
  monacoTheme: {
    base: 'vs' | 'vs-dark' | 'hc-black'
    inherit: boolean
    rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
    colors: Record<string, string>
  }
  xtermTheme: ITheme
  type: 'dark' | 'light'
}
