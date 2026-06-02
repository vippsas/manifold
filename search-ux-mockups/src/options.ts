export type OptionId =
  | 'baseline'
  | 'command-palette'
  | 'titlebar-bar'
  | 'activity-rail'
  | 'statusbar'

export interface SearchOption {
  id: OptionId
  label: string
  tagline: string
  prominence: 'Hidden' | 'Medium' | 'High' | 'Very high'
  pros: string[]
  cons: string[]
}

export const OPTIONS: SearchOption[] = [
  {
    id: 'baseline',
    label: 'Today (baseline)',
    tagline: 'Search only via ⌘⇧F or the Memory panel link — no visible home.',
    prominence: 'Hidden',
    pros: ['Zero added chrome', 'Familiar to power users'],
    cons: [
      'Undiscoverable for new users',
      'No persistent affordance anywhere',
      'Requires memorizing a shortcut',
    ],
  },
  {
    id: 'command-palette',
    label: 'Command palette (⌘K)',
    tagline: 'A centered overlay launcher — the modern, expected pattern.',
    prominence: 'High',
    pros: [
      'Familiar to developers (VS Code, Linear, Raycast)',
      'Prominent without permanent screen cost',
      'Room for modes, scopes, and AI ask inline',
    ],
    cons: ['Still shortcut-driven unless paired with a visible trigger'],
  },
  {
    id: 'titlebar-bar',
    label: 'Title-bar search field',
    tagline: 'An always-visible input centered in the top chrome.',
    prominence: 'Very high',
    pros: ['Impossible to miss', 'Single click to focus', 'Reads as a first-class feature'],
    cons: ['Consumes scarce title-bar width', 'Competes with project name / theme controls'],
  },
  {
    id: 'activity-rail',
    label: 'Activity-bar icon',
    tagline: 'A dedicated search icon on a left rail, VS Code style.',
    prominence: 'High',
    pros: ['Persistent and discoverable', 'Scales to other tools (memory, git)', 'Familiar IDE metaphor'],
    cons: ['Adds a new vertical rail to the shell', 'One more click than an inline field'],
  },
  {
    id: 'statusbar',
    label: 'Status-bar trigger',
    tagline: 'A compact search button anchored in the bottom bar.',
    prominence: 'Medium',
    pros: ['Uses existing chrome', 'Low layout disruption'],
    cons: ['Bottom bar draws less attention', 'Cramped next to commit / PR controls'],
  },
]

export const DEFAULT_OPTION: OptionId = 'titlebar-bar'
