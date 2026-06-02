import { useEffect, useRef, useState } from 'react'
import styles from './TitleBarSearch.module.css'
import { SearchIcon, MemoryIcon, GitIcon, CornerReturnIcon } from './icons'

type Kind = 'code' | 'memory' | 'session'
interface Hit {
  title: string
  meta: string
  kind: Kind
}

// Faux corpus — enough variety that live filtering feels real.
const CORPUS: Hit[] = [
  { title: 'executeSearchQuery', meta: 'src/main/search/search-query-service.ts:14', kind: 'code' },
  { title: 'showSearchPanel', meta: 'src/renderer/hooks/useAppEffects.ts:39', kind: 'code' },
  { title: 'ripgrep query engine', meta: 'src/main/search/ripgrep-engine.ts', kind: 'code' },
  { title: 'mergeSearchResults', meta: 'src/main/search/merge.ts:88', kind: 'code' },
  { title: 'SearchPanel.tsx', meta: 'src/renderer/components/SearchPanel.tsx', kind: 'code' },
  { title: '“user prefers structural borders kept”', meta: 'memory · observation', kind: 'memory' },
  { title: '“search must be reachable without a shortcut”', meta: 'memory · preference', kind: 'memory' },
  { title: 'search-prominence', meta: 'session · running', kind: 'session' },
  { title: 'memory-fts-fix', meta: 'session · error', kind: 'session' },
]

const SCOPES = ['Everything', 'Code', 'Memory', 'Sessions'] as const
type Scope = (typeof SCOPES)[number]

const SCOPE_KIND: Record<Scope, Kind | null> = {
  Everything: null,
  Code: 'code',
  Memory: 'memory',
  Sessions: 'session',
}
const KIND_LABEL: Record<Kind, string> = { code: 'Code', memory: 'Memory', session: 'Sessions' }
const KIND_ORDER: Kind[] = ['code', 'memory', 'session']

function iconFor(kind: Kind) {
  if (kind === 'memory') return <MemoryIcon />
  if (kind === 'session') return <GitIcon />
  return <SearchIcon />
}

function highlight(text: string, q: string) {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className={styles.mark}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function TitleBarSearch() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [scope, setScope] = useState<Scope>('Everything')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const q = query.trim()
  const kind = SCOPE_KIND[scope]
  const inScope = CORPUS.filter((h) => !kind || h.kind === kind)
  const shown = q
    ? inScope.filter((h) => `${h.title} ${h.meta}`.toLowerCase().includes(q.toLowerCase()))
    : inScope.slice(0, 4)
  const groups = KIND_ORDER.map((k) => ({ kind: k, hits: shown.filter((h) => h.kind === k) })).filter(
    (g) => g.hits.length,
  )

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={`${styles.field} ${focused ? styles.fieldFocused : styles.spotlight}`}>
        <SearchIcon size={14} />
        <input
          className={styles.input}
          placeholder="Search code & memory…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => e.key === 'Escape' && setFocused(false)}
        />
        {query ? (
          <button
            className={styles.clear}
            aria-label="Clear"
            onMouseDown={(e) => {
              e.preventDefault()
              setQuery('')
            }}
          >
            ✕
          </button>
        ) : (
          !focused && <span className={styles.kbd}>⌘⇧F</span>
        )}
      </div>

      {focused && (
        <div className={styles.dropdown}>
          <div className={styles.scopes}>
            {SCOPES.map((s) => (
              <button
                key={s}
                className={`${styles.scope} ${s === scope ? styles.scopeActive : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setScope(s)
                }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className={styles.results}>
            {!q && <div className={styles.groupLabel}>Recent</div>}
            {q && groups.length === 0 && <div className={styles.empty}>No matches for “{q}”.</div>}
            {groups.map((g) => (
              <div key={g.kind}>
                {q && <div className={styles.groupLabel}>{KIND_LABEL[g.kind]}</div>}
                {g.hits.map((h, i) => (
                  <div
                    key={h.title}
                    className={`${styles.result} ${q && g === groups[0] && i === 0 ? styles.resultActive : ''}`}
                  >
                    <span className={styles.resultIcon}>{iconFor(h.kind)}</span>
                    <div className={styles.resultBody}>
                      <div className={styles.resultTitle}>{highlight(h.title, q)}</div>
                      <div className={styles.resultMeta}>{h.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            {q ? (
              <span className={styles.aiRow}>
                <span className={styles.aiBadge}>Ask AI</span>
                Search “{q}” with the assistant
                <span className={styles.aiKbd}>⌥⏎</span>
              </span>
            ) : (
              <>
                <span>
                  <span className={styles.fkbd}>↑↓</span> navigate
                </span>
                <span>
                  <CornerReturnIcon /> open
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
