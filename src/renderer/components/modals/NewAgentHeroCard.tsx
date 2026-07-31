import React, { useState } from 'react'
import { heroStyles } from './NewAgentHero.styles'

function Glyph({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const ChatGlyph = (
  <Glyph><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z" /></Glyph>
)

export const TerminalGlyph = (
  <Glyph><path d="M4 5.5h16v13H4z" /><path d="m8 10 2.5 2.5L8 15" /><path d="M13.5 15H16" /></Glyph>
)

export const BranchGlyph = (
  <Glyph>
    <circle cx="7" cy="6" r="2" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="8" r="2" />
    <path d="M7 8v8" /><path d="M17 10c0 3.2-2.8 4.6-6 5.4" />
  </Glyph>
)

export const WorktreeGlyph = (
  <Glyph><path d="M4 7a2 2 0 0 1 2-2h3l1.8 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" /></Glyph>
)

interface Props {
  icon: React.ReactNode
  label: string
  caption: string
  onClick: () => void
  variant: 'action' | 'option'
  disabled?: boolean
  /** Option cards only — renders the card as a toggle rather than a button. */
  pressed?: boolean
  hint?: string
}

export function NewAgentHeroCard({ icon, label, caption, onClick, variant, disabled, pressed, hint }: Props): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...heroStyles.card,
        ...(variant === 'action' ? heroStyles.cardAction : heroStyles.cardOption),
        ...(pressed ? heroStyles.cardOn : {}),
        ...(hover && !disabled ? heroStyles.cardHover : {}),
        ...(disabled ? heroStyles.cardDisabled : {}),
      }}
    >
      {hint && <span style={heroStyles.cardHint}>{hint}</span>}
      {icon}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={heroStyles.cardLabel}>{label}</span>
        <span style={heroStyles.cardCaption}>{caption}</span>
      </span>
    </button>
  )
}
