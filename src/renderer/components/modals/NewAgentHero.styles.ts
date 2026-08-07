import type React from 'react'

export const heroStyles: Record<string, React.CSSProperties> = {
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-lg)',
    width: 480,
    maxWidth: '92%',
  },
  // The mark and the headline are one block, tighter to each other than to the
  // list they introduce.
  masthead: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-md)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-display)',
    fontSize: 'var(--type-display)',
    fontWeight: 400,
    letterSpacing: 'var(--tracking-tight)',
    color: 'var(--text-primary)',
    textAlign: 'center',
  },
  // The workspace is the one thing on this screen that decides where the agent
  // works, so it's the one thing set in italic accent.
  titleWorkspace: {
    fontStyle: 'italic',
    fontWeight: 500,
    color: 'var(--accent-hi, var(--accent))',
  },
}
