import React from 'react'
import { ThemePicker } from '../ThemePicker'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'

interface Props {
  theme: string
  onThemeChange: (theme: string) => void
  onPreviewTheme?: (themeId: string | null) => void
}

export function ThemeSettingsSection(props: Props): React.JSX.Element {
  return (
    <>
      <SectionHeader
        title="Theme"
        description="Colors for the interface, the editor, and the terminal. Hovering a theme previews it live across the app; the pick is only kept when you Save."
      />
      <SectionCard title="Bundled Themes" description="Each family ships a dark and a light variant. ⇧⌘P → Toggle Theme flips between the pair.">
        <ThemePicker
          currentThemeId={props.theme}
          onSelect={props.onThemeChange}
          onPreview={props.onPreviewTheme}
        />
      </SectionCard>
    </>
  )
}
