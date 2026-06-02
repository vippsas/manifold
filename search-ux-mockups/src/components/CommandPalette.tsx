import styles from './CommandPalette.module.css'
import { SearchIcon, MemoryIcon, CornerReturnIcon } from './icons'

const SCOPES = ['Code', 'Memory', 'Everything'] as const

interface Result {
  title: React.ReactNode
  meta: string
  kind: 'code' | 'memory'
}

const RESULTS: Result[] = [
  { title: <>executeSearch<mark className={styles.mark}>Query</mark></>, meta: 'src/main/search/search-query-service.ts:14', kind: 'code' },
  { title: <>show<mark className={styles.mark}>Search</mark>Panel</>, meta: 'src/renderer/hooks/useAppEffects.ts:39', kind: 'code' },
  { title: <>ripgrep <mark className={styles.mark}>query</mark> engine</>, meta: 'src/main/search/ripgrep-engine.ts', kind: 'code' },
  { title: <>“user prefers structural borders kept”</>, meta: 'memory · observation', kind: 'memory' },
]

export function CommandPalette({ onClose }: { onClose: () => void }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <SearchIcon size={16} />
          <div className={styles.input}>
            search query<span className={styles.cursor}>&nbsp;</span>
          </div>
        </div>

        <div className={styles.scopes}>
          {SCOPES.map((s, i) => (
            <span key={s} className={`${styles.scope} ${i === 0 ? styles.scopeActive : ''}`}>
              {s}
            </span>
          ))}
        </div>

        <div className={styles.results}>
          {RESULTS.map((r, i) => (
            <div key={i} className={`${styles.result} ${i === 0 ? styles.resultActive : ''}`}>
              <span className={styles.resultIcon}>
                {r.kind === 'code' ? <SearchIcon /> : <MemoryIcon />}
              </span>
              <div className={styles.resultBody}>
                <div className={styles.resultTitle}>{r.title}</div>
                <div className={styles.resultMeta}>{r.meta}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span><span className={styles.kbd}>↑↓</span> navigate</span>
          <span><CornerReturnIcon /> open</span>
          <span className={styles.footerSpacer} />
          <span className={styles.aiHint}>⌥⏎ Ask AI</span>
        </div>
      </div>
    </div>
  )
}
