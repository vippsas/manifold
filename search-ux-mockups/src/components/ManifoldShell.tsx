import { useEffect, useState } from 'react'
import styles from './ManifoldShell.module.css'
import { CommandPalette } from './CommandPalette'
import { TitleBarSearch } from './TitleBarSearch'
import { SearchIcon, MemoryIcon, GitIcon } from './icons'
import type { OptionId } from '../options'

const SESSIONS = [
  { name: 'search-prominence', status: 'var(--status-running)', active: true },
  { name: 'theme-refresh', status: 'var(--status-waiting)', active: false },
  { name: 'sidebar-resize', status: 'var(--status-done)', active: false },
  { name: 'memory-fts-fix', status: 'var(--status-error)', active: false },
]

export function ManifoldShell({ activeOption }: { activeOption: OptionId }) {
  const [paletteOpen, setPaletteOpen] = useState(activeOption === 'command-palette')

  useEffect(() => {
    setPaletteOpen(activeOption === 'command-palette')
  }, [activeOption])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showRail = activeOption === 'activity-rail'

  return (
    <div className={styles.window}>
      {/* Title bar */}
      <div className={styles.titlebar}>
        <div className={styles.traffic}>
          <span className={`${styles.dot} ${styles.dotRed}`} />
          <span className={`${styles.dot} ${styles.dotYellow}`} />
          <span className={`${styles.dot} ${styles.dotGreen}`} />
        </div>
        <span className={styles.project}>manifold</span>

        {activeOption === 'titlebar-bar' ? (
          <>
            <div className={styles.titlebarSpacer} />
            <TitleBarSearch />
            <div className={styles.titlebarSpacer} />
          </>
        ) : (
          <div className={styles.titlebarSpacer} />
        )}

        <div className={styles.titlebarControls}>
          <span className={styles.chip}>Themes</span>
          <span>◐</span>
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {showRail && (
          <div className={styles.rail}>
            <div className={`${styles.railBtn} ${styles.railBtnActive} ${styles.spotlight}`}>
              <SearchIcon size={16} />
            </div>
            <div className={styles.railBtn}><MemoryIcon size={16} /></div>
            <div className={styles.railBtn}><GitIcon size={16} /></div>
          </div>
        )}

        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>Sessions</div>
          {SESSIONS.map((s) => (
            <div key={s.name} className={`${styles.session} ${s.active ? styles.sessionActive : ''}`}>
              <span className={styles.statusDot} style={{ background: s.status }} />
              {s.name}
            </div>
          ))}
        </div>

        <div className={styles.main}>
          <div className={styles.tabs}>
            <div className={`${styles.tab} ${styles.tabActive}`}>search-query-service.ts</div>
            <div className={styles.tab}>SearchPanel.tsx</div>
          </div>
          <div className={styles.editor}>
            <div className={styles.codeLine}><span className={styles.kw}>export async function</span> <span className={styles.fn}>executeSearchQuery</span>(req) {'{'}</div>
            <div className={styles.codeLine}>{'  '}<span className={styles.kw}>const</span> sessions = resolveScope(req.scope)</div>
            <div className={styles.codeLine}>{'  '}<span className={styles.kw}>const</span> code = <span className={styles.kw}>await</span> <span className={styles.fn}>codeSearch</span>(req, sessions)</div>
            <div className={styles.codeLine}>{'  '}<span className={styles.kw}>const</span> memory = <span className={styles.kw}>await</span> <span className={styles.fn}>memorySearch</span>(req)</div>
            <div className={styles.codeLine}>{'  '}<span className={styles.kw}>return</span> merge(code, memory, <span className={styles.str}>req.mode</span>)</div>
            <div className={styles.codeLine}>{'}'}</div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className={styles.statusbar}>
        <span>⎇ search-prominence</span>
        <span>● 2 ahead</span>
        {activeOption === 'statusbar' && (
          <button className={`${styles.statusSearch} ${styles.spotlight}`}>
            <SearchIcon size={12} />
            Search
          </button>
        )}
        <span className={styles.statusbarSpacer} />
        <span>PR #388</span>
        <span>⚙</span>
      </div>

      {paletteOpen && activeOption === 'command-palette' && (
        <CommandPalette onClose={() => setPaletteOpen(false)} />
      )}
    </div>
  )
}
