import React, { useEffect, useState } from 'react'
import type { LoopConfig } from '../../types'
import { loopPanelStyles as S, stateColors } from '../styles'
import { describeMetric } from '../helpers'
import { LoopConfigForm } from './LoopConfigForm'
import { IterationList } from './LoopIterationList'
import { useLoopBridge } from '../use-loop-bridge'

export function LoopPanel(): React.JSX.Element {
  const loop = useLoopBridge()
  const sessionId = loop.sessionId
  const [restoreMsg, setRestoreMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (!restoreMsg) return
    const t = window.setTimeout(() => setRestoreMsg(null), 4000)
    return () => window.clearTimeout(t)
  }, [restoreMsg])

  if (!sessionId) {
    return (
      <div style={S.wrapper}>
        <div style={S.empty}>
          <div>Select a session to configure an autoresearch loop.</div>
          <div style={{ color: 'var(--text-muted)' }}>
            The loop repeatedly asks the agent to edit files, then runs an eval command
            to decide whether each attempt is an improvement.
          </div>
        </div>
      </div>
    )
  }

  const isRunning = loop.status?.state === 'running'
  const hasConfig = loop.config !== null
  const hasImprovement = !!loop.status?.bestCommitSha && loop.status.bestCommitSha !== loop.status.baselineSha
  const canClear = !isRunning && (loop.iterations.length > 0 || loop.status !== null)

  const handleClear = (): void => { loop.clear() }

  const handleRestoreBest = async (): Promise<void> => {
    setRestoring(true)
    try {
      const { sha } = await loop.restoreBest()
      setRestoreMsg({ kind: 'ok', text: `Restored to ${sha.slice(0, 7)}` })
    } catch (err) {
      setRestoreMsg({ kind: 'err', text: `Restore failed: ${(err as Error).message}` })
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div style={S.wrapper}>
      <div style={S.header}>
        <div style={S.title}>Autoresearch Loop</div>
        <div style={S.headerActions}>
          {restoreMsg && (
            <span
              style={{
                fontSize: 'var(--type-ui-caption)',
                color: restoreMsg.kind === 'ok' ? 'var(--status-done)' : 'var(--status-error)',
              }}
            >
              {restoreMsg.text}
            </span>
          )}
          {isRunning && (
            <button style={S.secondaryButton} onClick={() => loop.stop()}>Stop</button>
          )}
          {!isRunning && hasImprovement && (
            <button
              style={S.secondaryButton}
              disabled={restoring}
              onClick={() => void handleRestoreBest()}
            >
              {restoring ? 'Restoring…' : 'Restore Best'}
            </button>
          )}
          {canClear && (
            <button style={S.secondaryButton} onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {loop.status && (
        <div style={{ ...S.statusBar, ...(isRunning ? S.statusBarRunning : null) }}>
          <div style={{ ...S.stateDot, background: stateColors[loop.status.state] ?? 'var(--text-muted)' }} />
          <div>{loop.status.state}</div>
          <div style={{ color: 'var(--text-muted)' }}>
            iter {loop.status.currentIteration}
          </div>
          {loop.status.bestScore !== undefined && (
            <span style={S.bestBadge}>best {loop.status.bestScore}</span>
          )}
          {isRunning && (
            <span style={S.statusBarShimmer} aria-hidden="true">
              <span style={S.statusBarShimmerFill} />
            </span>
          )}
        </div>
      )}

      <div style={S.content}>
        {!isRunning && <LoopIntro />}
        {!hasConfig || !isRunning ? (
          <LoopConfigForm
            sessionId={sessionId}
            initialConfig={loop.config}
            disabled={isRunning}
            onStart={(cfg) => loop.start(cfg)}
            onSave={(cfg) => loop.saveConfig(cfg)}
            onImproveWithAi={loop.improveWithAi}
          />
        ) : null}

        {isRunning && loop.config && loop.status && (
          <PendingIterationCard
            iterationNumber={loop.iterations.length + 1}
            config={loop.config}
          />
        )}

        {loop.iterations.length > 0 && (
          <IterationList iterations={loop.iterations} />
        )}
      </div>
    </div>
  )
}

function LoopIntro(): React.JSX.Element {
  return (
    <details style={S.disclosure}>
      <summary style={S.disclosureSummary}>What is this?</summary>
      <div style={{ ...S.disclosureBody, padding: '0 var(--space-sm) var(--space-sm)' }}>
        <div>
          The loop repeatedly asks the agent to edit your target files, then runs your eval
          command to score the result. Improvements are committed; regressions are discarded
          via <code>git reset --hard</code>. Git is the undo buffer.
        </div>
        <div style={S.introSection}>
          <span style={S.introTag}>Good for</span>
          <span>tasks with an automatable scalar metric — test pass/fail, benchmark timing, bundle size, lint error count. Anywhere you&apos;d otherwise guess-and-check.</span>
        </div>
        <div style={S.introSection}>
          <span style={S.introTagMuted}>Avoid for</span>
          <span>open-ended design work, subjective quality (&ldquo;make the UI nicer&rdquo;), or one-shot changes you already know how to make. If you can&apos;t write an eval command that decides &ldquo;better,&rdquo; don&apos;t loop.</span>
        </div>
      </div>
    </details>
  )
}

function PendingIterationCard({ iterationNumber, config }: { iterationNumber: number; config: LoopConfig }): React.JSX.Element {
  const maxIter = config.maxIterations ?? '∞'
  return (
    <div style={S.pendingCard}>
      <div style={S.pendingHeader}>
        <span style={S.pendingPulse} aria-hidden="true" />
        <span>Iteration {iterationNumber} of {maxIter} in progress…</span>
      </div>
      <div style={S.pendingProgressTrack} aria-hidden="true">
        <div style={S.pendingProgressBar} />
      </div>
      <div style={S.pendingMeta}>
        <span style={S.pendingMetaLabel}>Eval</span>
        <span style={S.pendingMetaValue}>{config.evalCommand}</span>
        <span style={S.pendingMetaLabel}>Targets</span>
        <span style={S.pendingMetaValue}>{config.targetGlobs.join(', ')}</span>
        <span style={S.pendingMetaLabel}>Metric</span>
        <span style={S.pendingMetaValue}>{describeMetric(config.metric)}</span>
      </div>
      <div style={S.pendingHint}>
        The agent is editing target files, then the eval command will run with a {config.budgetSeconds}s timeout. Result will appear here once scored.
      </div>
    </div>
  )
}
