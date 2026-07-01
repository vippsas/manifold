import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useDockState } from '../editor/editor-shell/dock-panel-types'
import { ModifiedFiles } from './ModifiedFiles'
import { sourceControlStyles as styles } from './SourceControl.styles'

// VS Code-style Source Control view for the sidebar: an inline commit message
// box + Commit button on top, then the working-tree changes list. Commit stages
// everything and reuses the git:commit flow via dockState.onCommit (no PR modal).
export function SourceControl(): React.JSX.Element {
  const {
    changes,
    worktreeRoot,
    activeFilePath,
    onSelectFile,
    onCommit,
    onAiGenerate,
    diffText,
    sessionId,
  } = useDockState()

  const [message, setMessage] = useState('')
  const [committing, setCommitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Bumped on Stop so a discarded generation's late result is ignored — the
  // IPC has no abort, so cancellation is client-side.
  const generationRef = useRef(0)

  const canCommit = Boolean(sessionId) && changes.length > 0 && message.trim().length > 0 && !committing

  // Auto-grow the textarea to fit its content, up to the CSS maxHeight (then it
  // scrolls). Runs on every message change so it also shrinks back when cleared.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [message])

  const handleCommit = useCallback(async (): Promise<void> => {
    if (!canCommit) return
    setCommitting(true)
    try {
      await onCommit(message.trim())
      setMessage('')
    } catch {
      // Leave the message in place so the user can retry.
    } finally {
      setCommitting(false)
    }
  }, [canCommit, message, onCommit])

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (generating || !diffText) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    setGenerating(true)
    try {
      const prompt = `Write a concise git commit message (subject line only, imperative mood, \u226472 chars) for the following diff. Output only the message, nothing else.\n\n${diffText.slice(0, 8000)}`
      const result = await onAiGenerate(prompt)
      // Ignore the result if Stop was pressed (a newer generation id) while it ran.
      if (generation === generationRef.current && result) setMessage(result)
    } catch {
      // Non-fatal — the user can type a message manually.
    } finally {
      if (generation === generationRef.current) {
        setGenerating(false)
        textareaRef.current?.focus()
      }
    }
  }, [generating, diffText, onAiGenerate])

  const handleStopGenerate = useCallback((): void => {
    generationRef.current += 1
    setGenerating(false)
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Cmd/Ctrl+Enter commits, matching VS Code's Source Control input.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleCommit()
    }
  }, [handleCommit])

  if (!sessionId || !worktreeRoot) {
    return (
      <div style={styles.wrapper}>
        <div style={styles.empty}>No active repository</div>
      </div>
    )
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.commitBox}>
        <div style={styles.messageRow}>
          <textarea
            ref={textareaRef}
            className="git-panel-textarea"
            style={styles.message}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message (⌘Enter to commit)"
            rows={2}
          />
          <button
            type="button"
            className="git-panel-btn git-panel-btn--small git-panel-btn--accent"
            style={styles.aiButton}
            onClick={() => (generating ? handleStopGenerate() : void handleGenerate())}
            disabled={!generating && !diffText}
            title={generating ? 'Stop generating' : 'Generate commit message with AI'}
            aria-label={generating ? 'Stop generating' : 'Generate commit message with AI'}
          >
            {generating ? '\u25A0' : '\u2726'}
          </button>
        </div>
        <button
          type="button"
          className="git-panel-btn git-panel-btn--primary"
          style={styles.commitButton}
          onClick={() => void handleCommit()}
          disabled={!canCommit}
          title={changes.length === 0 ? 'No changes to commit' : 'Commit all changes'}
        >
          {committing ? 'Committing\u2026' : `Commit${changes.length > 0 ? ` (${changes.length})` : ''}`}
        </button>
      </div>
      <div style={styles.list}>
        <ModifiedFiles
          changes={changes}
          activeFilePath={activeFilePath}
          worktreeRoot={worktreeRoot}
          onSelectFile={onSelectFile}
        />
      </div>
    </div>
  )
}
