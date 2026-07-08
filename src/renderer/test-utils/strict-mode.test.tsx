// Reusable StrictMode double-mount test TEMPLATE.
//
// Copy this file next to a component and swap `AsyncGate` for the real one to
// guard against the "effect ran setup → cleanup → setup, and stale state stuck
// after the remount" bug class. The app mounts under <React.StrictMode>
// (src/renderer/index.tsx), so this cycle happens on every first render in dev
// — and after any real unmount/remount in production. A bare render() (and a
// packaged-build click-through) mount once and miss it entirely.
//
// The three tests below double as an executable proof that the harness catches
// the bug: the buggy variant hangs only under StrictMode, the fixed variant
// does not, and a bare render() hides the difference. See
// docs/architecture/gotchas.md.
import React, { useEffect, useRef, useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { renderWithStrictMode } from './strict-mode.test-helpers'

/**
 * Minimal stand-in for a component that kicks off async work on mount and only
 * applies the result if still mounted — the exact shape of NewAgentForm's
 * launch path and useIpcInvoke.
 *
 * `resetInBody` toggles the one line that separates the bug from the fix:
 *   - false (BUG):  mountedRef is reset to false in cleanup but never set back
 *                   to true in the effect body, so after StrictMode's remount
 *                   it stays false and the resolved async callback is dropped.
 *   - true  (FIX):  the effect body sets it back to true on every (re)mount, so
 *                   the ref is valid after the remount.
 */
function AsyncGate({ resetInBody }: { resetInBody: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<'loading' | 'done'>('loading')
  const mountedRef = useRef(true)

  useEffect(() => {
    if (resetInBody) mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [resetInBody])

  useEffect(() => {
    // Async work that resolves after StrictMode's setup→cleanup→setup completes,
    // then applies its result only if the component is still "mounted".
    void Promise.resolve().then(() => {
      if (mountedRef.current) setStatus('done')
    })
  }, [])

  return <div>{status}</div>
}

// Flush the microtask the effect scheduled (the Promise.resolve().then above).
async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('StrictMode double-mount template', () => {
  it('reproduces the hang: cleanup-only mountedRef stays false after remount', async () => {
    renderWithStrictMode(<AsyncGate resetInBody={false} />)
    await flushMicrotasks()

    // The async result was dropped because mountedRef.current === false after
    // the StrictMode remount — the component is stuck on its loading state.
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(screen.queryByText('done')).toBeNull()
  })

  it('passes when the effect body resets mountedRef on (re)mount', async () => {
    renderWithStrictMode(<AsyncGate resetInBody={true} />)

    expect(await screen.findByText('done')).toBeInTheDocument()
  })

  it('shows why a single mount (bare render / packaged build) hides the bug', async () => {
    render(<AsyncGate resetInBody={false} />)
    await flushMicrotasks()

    // No remount, so mountedRef is still its initial `true`: the same buggy
    // component reaches 'done'. This is why only a StrictMode test catches it.
    expect(await screen.findByText('done')).toBeInTheDocument()
  })
})
