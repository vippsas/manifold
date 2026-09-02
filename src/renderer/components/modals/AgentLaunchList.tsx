import React, { useEffect, useRef, useState } from 'react'
import type { AgentRuntime } from '../../../shared/types'
import type { AgentMode, PendingLaunch } from './useNewAgentForm'
import { RuntimeGlyph, runtimeGlyphPath } from '../new-task/RuntimeGlyph'
import { PluginGlyph } from '../plugin-glyphs'
import { launchListStyles as s } from './AgentLaunchList.styles'

const ChatGlyph = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4V6Z" />
  </svg>
)

function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ ...s.chevron, transform: open ? 'rotate(90deg)' : undefined }}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

interface RowProps {
  glyph: React.ReactNode
  name: string
  onClick: () => void
  disabled?: boolean
  starting?: boolean
  trailing?: React.ReactNode
  buttonRef?: React.Ref<HTMLButtonElement>
  /** The lead row: wears the gold metal plate instead of the dark console one. */
  metal?: boolean
}

function Row({ glyph, name, onClick, disabled, starting, trailing, buttonRef, metal }: RowProps): React.JSX.Element {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      ref={buttonRef}
      className={metal ? 'btn-metal' : undefined}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...s.row,
        ...(metal ? {} : s.rowPlate),
        // `.btn-metal` brightens itself on hover; layering the plate hover on
        // top would grey out the gold.
        ...(hover && !disabled && !metal ? s.rowHover : {}),
        ...(disabled ? s.rowDisabled : {}),
      }}
    >
      <span style={s.icon}>{glyph}</span>
      <span style={s.name}>{name}</span>
      {starting ? (
        <span style={metal ? s.metaOnMetal : s.meta}><span className="spinner" aria-hidden="true" />Starting…</span>
      ) : trailing ? (
        <span style={metal ? s.metaOnMetal : s.meta}>{trailing}</span>
      ) : null}
    </button>
  )
}

function runtimeGlyph(runtime: AgentRuntime): React.ReactNode {
  if (runtime.kind === 'orchestrator') return <PluginGlyph icon="layers" size={22} />
  const path = runtimeGlyphPath(runtime.id)
  return path
    ? <RuntimeGlyph path={path} size={22} />
    : <span style={s.monogram}>{runtime.name.charAt(0).toUpperCase()}</span>
}

/**
 * The agent list: CLI harnesses start in a terminal, native orchestrators start
 * in chat, and the Chat row can wrap a CLI runtime in Manifold's chat surface.
 * Shared by the compact dialog and the full-panel start view.
 *
 * Exactly one row leads — the runtime you launched last — and it wears the gold
 * metal plate so the list has an obvious default rather than a wall of equals.
 */
export function AgentLaunchList({
  runtimes,
  pending,
  onLaunch,
  focusTrigger,
  leadRuntimeId,
}: {
  runtimes: AgentRuntime[]
  pending: PendingLaunch | null
  onLaunch: (runtimeId: string, mode: AgentMode) => void
  focusTrigger?: number
  /** The remembered runtime. Falls back to the first installed one. */
  leadRuntimeId?: string
}): React.JSX.Element {
  const [chatOpen, setChatOpen] = useState(false)
  const firstRowRef = useRef<HTMLButtonElement>(null)
  const loading = pending !== null

  useEffect(() => {
    firstRowRef.current?.focus()
  }, [focusTrigger])

  // The Ollama `needsModel` variants relaunch the same two agents and would
  // double every row, so they stay out of the list.
  const providers = runtimes.filter((rt) => !rt.needsModel)
  const installedProviders = providers.filter((rt) => rt.installed !== false)
  const chatProviders = installedProviders.filter((rt) => rt.kind !== 'orchestrator')
  // A runtime that isn't installed can't lead — the plate would advertise a
  // default you can't click.
  const lead = installedProviders.find((rt) => rt.id === leadRuntimeId) ?? installedProviders[0]

  return (
    <div style={s.list}>
      {providers.map((runtime, index) => {
        const missing = runtime.installed === false
        const mode: AgentMode = runtime.kind === 'orchestrator' ? 'chat' : 'interactive'
        const launchName = runtime.id === 'viola' ? `${runtime.name} (alpha)` : runtime.name
        return (
          <Row
            key={runtime.id}
            buttonRef={index === 0 ? firstRowRef : undefined}
            glyph={runtimeGlyph(runtime)}
            name={launchName}
            metal={runtime.id === lead?.id}
            disabled={missing || loading}
            starting={pending?.runtimeId === runtime.id && pending.mode === mode}
            trailing={missing
              ? runtime.kind === 'orchestrator' ? 'needs 2 installed agents' : 'not installed'
              : runtime.kind === 'orchestrator' ? 'Plan and delegate' : undefined}
            onClick={() => onLaunch(runtime.id, mode)}
          />
        )
      })}

      <Row
        glyph={ChatGlyph}
        name="Chat with interface"
        disabled={loading}
        trailing={<Chevron open={chatOpen} />}
        onClick={() => setChatOpen((open) => !open)}
      />
      {chatOpen && (
        <div style={s.chatPanel}>
          <span style={s.chatPanelLabel}>Choose a provider to chat with</span>
          {chatProviders.map((runtime) => (
            <Row
              key={runtime.id}
              glyph={runtimeGlyph(runtime)}
              name={runtime.name}
              disabled={loading}
              starting={pending?.runtimeId === runtime.id && pending.mode === 'chat'}
              onClick={() => onLaunch(runtime.id, 'chat')}
            />
          ))}
        </div>
      )}
    </div>
  )
}
