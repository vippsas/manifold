import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import styles from './App.module.css'
import { ManifoldShell } from './components/ManifoldShell'
import { OptionPanel } from './components/OptionPanel'
import { db } from './db'
import { OPTIONS, DEFAULT_OPTION, type OptionId } from './options'

type View = 'preview' | 'compare'

function stars(rating: number): string {
  return rating > 0 ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '☆☆☆☆☆'
}

export function App() {
  const [selected, setSelected] = useState<OptionId>(DEFAULT_OPTION)
  const [view, setView] = useState<View>('preview')

  const ratings = useLiveQuery(async () => {
    const rows = await db.feedback.toArray()
    return Object.fromEntries(rows.map((r) => [r.optionId, r.rating]))
  }, [], {} as Record<string, number>)

  const current = OPTIONS.find((o) => o.id === selected)!

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <span className={styles.title}>
          <span className={styles.titleAccent}>Manifold</span> · Search UX Lab
        </span>
        <span className={styles.subtitle}>Comparing ways to give search a prominent home</span>
        <span className={styles.headerSpacer} />
        <div className={styles.viewToggle}>
          <button
            className={`${styles.viewBtn} ${view === 'preview' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('preview')}
          >
            Preview
          </button>
          <button
            className={`${styles.viewBtn} ${view === 'compare' ? styles.viewBtnActive : ''}`}
            onClick={() => setView('compare')}
          >
            Compare all
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.controls}>
          <div className={styles.optionList}>
            {OPTIONS.map((o) => {
              const r = ratings[o.id] ?? 0
              return (
                <div
                  key={o.id}
                  className={`${styles.optionItem} ${o.id === selected ? styles.optionItemActive : ''}`}
                  onClick={() => {
                    setSelected(o.id)
                    setView('preview')
                  }}
                >
                  <div className={styles.optionTop}>
                    <span className={styles.optionName}>{o.label}</span>
                    <span className={`${styles.optionStars} ${r === 0 ? styles.optionStarsEmpty : ''}`}>
                      {stars(r)}
                    </span>
                  </div>
                  <span className={styles.optionTag}>{o.prominence} prominence</span>
                </div>
              )
            })}
          </div>
          <div className={styles.detail}>
            <OptionPanel key={current.id} option={current} />
          </div>
        </aside>

        {view === 'preview' ? (
          <main className={styles.canvas}>
            <div className={styles.canvasInner}>
              <div className={styles.hint}>
                Live mock of the Manifold shell · press <kbd>⌘K</kbd> to toggle the palette
              </div>
              <div style={{ height: 'calc(100% - 22px)' }}>
                <ManifoldShell activeOption={selected} />
              </div>
            </div>
          </main>
        ) : (
          <section className={styles.compare}>
            {OPTIONS.map((o) => (
              <div key={o.id} className={styles.compareCell}>
                <div className={styles.compareLabel}>
                  <span className={styles.compareName}>{o.label}</span>
                  <span className={styles.optionTag}>{o.prominence}</span>
                </div>
                <div
                  className={styles.compareFrame}
                  onClick={() => {
                    setSelected(o.id)
                    setView('preview')
                  }}
                >
                  <ManifoldShell activeOption={o.id} />
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
