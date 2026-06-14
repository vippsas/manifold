import React from 'react'
import { SectionCard, SectionHeader } from './SettingsSectionLayout'
import { ShortcutList } from '../../command-palette/ShortcutList'

/** Read-only Settings tab listing every command's keybinding. Editing bindings
 * is deferred to a follow-up PR (see issue #721). */
export function ShortcutsSettingsSection(): React.JSX.Element {
  return (
    <>
      <SectionHeader
        title="Keyboard Shortcuts"
        description="Every command and its keybinding. Commands shown as “Command Palette” have no direct key — open the palette with ⇧⌘P and search for them."
      />
      <SectionCard title="Active Bindings" description="Open this list any time with ⇧⌘/.">
        <ShortcutList />
      </SectionCard>
    </>
  )
}
