import React, { useCallback } from 'react'
import { ChatPane, useChat, useAgentStatus } from '../../../renderer-shared/chat'
import type { PastedImage, FileDropConfig } from '../../../renderer-shared/chat/ChatPane'

interface AgentChatViewProps {
  sessionId: string
  /** Relative paths offered by the `@FILENAME` autocomplete. */
  mentionPaths?: string[]
  /** Enables drag-and-drop of file-tree paths into the composer. */
  fileDrop?: FileDropConfig
}

export function AgentChatView({ sessionId, mentionPaths, fileDrop }: AgentChatViewProps): React.JSX.Element {
  const { messages, sendMessage } = useChat(sessionId)
  const { status, durationMs } = useAgentStatus(sessionId)
  const interrupt = useCallback(() => {
    void window.electronAPI.invoke('agent:interrupt', sessionId)
  }, [sessionId])

  const handleSend = useCallback(
    async (text: string, images?: PastedImage[]): Promise<void> => {
      if (!images || images.length === 0) {
        sendMessage(text)
        return
      }
      try {
        const paths = await Promise.all(
          images.map((img) =>
            window.electronAPI.invoke('chat:save-pasted-image', sessionId, img.dataUrl) as Promise<string>,
          ),
        )
        const references = paths.map((p) => `[image: ${p}]`).join('\n')
        const combined = text ? `${references}\n${text}` : references
        sendMessage(combined)
      } catch (err) {
        console.error('[AgentChatView] failed to save pasted images:', err)
        if (text) sendMessage(text)
      }
    },
    [sessionId, sendMessage],
  )

  return (
    <div style={{ height: '100%' }}>
      <ChatPane
        messages={messages}
        onSend={(text, images) => { void handleSend(text, images) }}
        onInterrupt={interrupt}
        isThinking={status === 'running'}
        durationMs={durationMs}
        placeholder={<AgentChatEmptyState />}
        acceptImages
        mentionPaths={mentionPaths}
        fileDrop={fileDrop}
      />
    </div>
  )
}

function AgentChatEmptyState(): React.JSX.Element {
  return (
    <div style={emptyStyles.container}>
      <div style={emptyStyles.logo} aria-hidden="true">
        <ManifoldGhost />
      </div>
      <div style={emptyStyles.heading}>Start the conversation</div>
      <ul style={emptyStyles.tips}>
        <li style={emptyStyles.tip}>Paste images straight into the message</li>
        <li style={emptyStyles.tip}>Or drag-and-drop image files here</li>
        <li style={emptyStyles.tip}>
          Press <kbd style={emptyStyles.kbd}>Shift</kbd>
          <span style={emptyStyles.plus}>+</span>
          <kbd style={emptyStyles.kbd}>Enter</kbd> for a new line
        </li>
      </ul>
    </div>
  )
}

function ManifoldGhost(): React.JSX.Element {
  return (
    <svg viewBox="0 0 1024 1024" width="84" height="84" aria-hidden="true">
      <defs>
        <mask id="manifold-ghost-cutouts">
          <rect width="1024" height="1024" fill="white" />
          <circle cx="410" cy="440" r="52" fill="black" />
          <circle cx="614" cy="440" r="52" fill="black" />
          <path d="M 430 540 Q 512 610 594 540 Q 570 580 512 590 Q 454 580 430 540 Z" fill="black" />
        </mask>
      </defs>
      <path
        mask="url(#manifold-ghost-cutouts)"
        fill="currentColor"
        d="M 512 180 C 340 180 260 310 260 440 L 260 700 Q 260 740 290 740 Q 320 710 350 740 Q 380 770 410 740 Q 440 710 470 740 Q 500 770 530 740 Q 560 710 590 740 Q 620 770 650 740 Q 680 710 710 740 Q 740 770 764 740 L 764 440 C 764 310 684 180 512 180 Z"
      />
    </svg>
  )
}

const emptyStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 'var(--space-md)',
    color: 'var(--text-muted)',
    userSelect: 'none' as const,
    textAlign: 'center' as const,
  },
  logo: {
    color: 'var(--accent)',
    opacity: 0.85,
    filter: 'drop-shadow(0 4px 18px color-mix(in srgb, var(--accent) 25%, transparent))',
  },
  heading: {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-secondary)',
  },
  tips: {
    listStyle: 'none' as const,
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 'var(--space-xs)',
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.6,
  },
  tip: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  kbd: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xs)',
    padding: '1px 6px',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  plus: {
    margin: '0 2px',
    color: 'var(--text-muted)',
  },
}
