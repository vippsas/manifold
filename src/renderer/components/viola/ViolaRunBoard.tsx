import React from 'react'
import type { ViolaRun, ViolaTaskRun } from '../../../shared/viola'
import { DockStateContext } from '../editor/editor-shell/dock-panel-types'
import { runBoardStyles as s } from './ViolaRunBoard.styles'

/** The step label shown per task. Short, lowercase, reads as a continuing action. */
const STEP_LABELS: Record<ViolaTaskRun['state'], string> = {
  planned: 'queued',
  spawning: 'starting',
  implementing: 'implementing',
  exploring: 'exploring',
  gating: 'running gates',
  reviewing: 'reviewing',
  fixing: 'fixing',
  done: 'done',
  needs_attention: 'needs attention',
  error: 'failed',
}

const STEP_COLORS: Record<ViolaTaskRun['state'], string> = {
  planned: 'var(--text-muted)',
  spawning: 'var(--status-running)',
  implementing: 'var(--status-running)',
  exploring: 'var(--status-running)',
  gating: 'var(--status-running)',
  reviewing: 'var(--status-running)',
  fixing: 'var(--status-waiting)',
  done: 'var(--status-done)',
  needs_attention: 'var(--status-waiting)',
  error: 'var(--status-error)',
}

/** A live view of one Viola run: one row per task, updating in place.
 *
 *  Rendered above the chat's thinking indicator, so a long run shows what its workers are doing
 *  while the animation underneath carries liveness. The elapsed clock ticks every second, which is
 *  what distinguishes a slow step from a hung one. Each row opens its worker's own terminal. */
export function ViolaRunBoard({ run }: { run: ViolaRun | undefined }): React.JSX.Element | null {
  const dock = React.useContext(DockStateContext)
  const elapsedNow = useTicker(run?.state === 'running')

  if (!run || run.state !== 'running') return null
  const open = dock?.onOpenSibling

  return (
    <ul style={s.board} aria-label="Viola run progress">
      {run.tasks.map((task) => {
        const color = STEP_COLORS[task.state]
        // While reviewing, the harness on the hook is the reviewer, not the implementer.
        const worker = task.state === 'reviewing' ? task.reviewRuntimeId : task.runtimeId
        const detail = detailFor(task)
        const body = (
          <>
            <span style={{ ...s.marker, background: color }} aria-hidden="true" />
            <span style={s.title}>{task.title}</span>
            <span style={{ ...s.step, color }}>{STEP_LABELS[task.state]}</span>
            {worker && <span style={s.worker}>{worker}</span>}
            {detail && <span style={s.detail}>{detail}</span>}
            <span style={s.elapsed}>{formatElapsed(elapsedNow - task.stateSince)}</span>
          </>
        )
        return (
          <li key={task.id} style={s.rowItem}>
            {task.sessionId && open ? (
              // The whole row is the target: the step label is the live-looking part, so making
              // only the title clickable reads as nothing happening.
              <button
                type="button"
                style={s.rowButton}
                title={`Open ${task.title} in its own tab`}
                onClick={() => open(task.sessionId!, task.title)}
              >
                {body}
              </button>
            ) : (
              <div style={s.row}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The one-line "why" for a row. A fixing task names what it is fixing: those findings used to
 *  reach the chat log and now live only here. */
function detailFor(task: ViolaTaskRun): string | undefined {
  if (task.state === 'fixing') return task.review?.blocking[0]
  return task.error
}

/** Re-renders once a second while live, so every row's clock advances on its own. */
function useTicker(live: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!live) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [live])
  return now
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}
