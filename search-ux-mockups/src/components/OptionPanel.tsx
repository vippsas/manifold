import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import styles from './OptionPanel.module.css'
import { db, saveFeedback } from '../db'
import type { SearchOption } from '../options'

export function OptionPanel({ option }: { option: SearchOption }) {
  const feedback = useLiveQuery(() => db.feedback.get(option.id), [option.id])
  const rating = feedback?.rating ?? 0

  const [notes, setNotes] = useState('')
  const [savedTick, setSavedTick] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load the saved notes whenever the selected option changes.
  useEffect(() => {
    let alive = true
    db.feedback.get(option.id).then((row) => {
      if (alive) setNotes(row?.notes ?? '')
    })
    return () => {
      alive = false
    }
  }, [option.id])

  const onNotesChange = (value: string) => {
    setNotes(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await saveFeedback(option.id, { notes: value })
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 1200)
    }, 400)
  }

  return (
    <div className={styles.panel}>
      <span className={styles.prominence}>Prominence · {option.prominence}</span>
      <p className={styles.tagline}>{option.tagline}</p>

      <div className={styles.cols}>
        <div>
          <div className={styles.colTitle}>Strengths</div>
          <ul className={`${styles.list} ${styles.pros}`}>
            {option.pros.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
        <div>
          <div className={styles.colTitle}>Trade-offs</div>
          <ul className={`${styles.list} ${styles.cons}`}>
            {option.cons.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      </div>

      <div className={styles.feedback}>
        <span className={styles.fieldLabel}>Your rating</span>
        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`${styles.star} ${n <= rating ? styles.starOn : ''}`}
              onClick={() => saveFeedback(option.id, { rating: n === rating ? 0 : n })}
              role="button"
              aria-label={`${n} star`}
            >
              ★
            </span>
          ))}
        </div>

        <span className={styles.fieldLabel}>Notes</span>
        <textarea
          className={styles.notes}
          value={notes}
          placeholder="What works, what doesn't, what to tweak…"
          onChange={(e) => onNotesChange(e.target.value)}
        />
        <span className={styles.saved}>{savedTick ? 'Saved to your browser ✓' : ''}</span>
      </div>
    </div>
  )
}
