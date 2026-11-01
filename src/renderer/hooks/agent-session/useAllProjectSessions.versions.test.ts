import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as React from 'react'
import { useAllProjectSessions } from './useAllProjectSessions'
import { getListener, installElectronApi, makeSession, mockInvoke, projects } from './useAllProjectSessions.test-helpers'

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof React>()
  return { ...react, useState: vi.fn(react.useState) }
})

beforeEach(installElectronApi)
afterEach(() => { vi.mocked(React.useState).mockReset() })

it.each(['agent:status', 'agent:exit'])('rejects a delayed %s updater after a newer snapshot while the repo is background again', async (channel) => {
  const one = makeSession('one', 'p1')
  const two = makeSession('two', 'p2')
  const fresh = { ...two, pid: 9999 }
  const { useState } = await vi.importActual<typeof React>('react')
  let deferUpdates = false
  const pending: Array<() => void> = []
  // Hold the real hook's updater before React can evaluate it. Releasing it
  // after committed snapshots removes queue ordering as an alternative guard.
  vi.mocked(React.useState).mockImplementation(((initial: unknown) => {
    const [state, setState] = useState(initial)
    return [state, (update: React.SetStateAction<unknown>) => {
      if (deferUpdates) pending.push(() => setState(update))
      else setState(update)
    }]
  }) as typeof React.useState)
  mockInvoke.mockResolvedValue([two])
  const { result, rerender } = renderHook(({ active, sessions }) =>
    useAllProjectSessions(projects, active, sessions, active), {
    initialProps: { active: 'p1', sessions: [one] },
  })
  await waitFor(() => expect(result.current.sessionsByProject.p2).toEqual([two]))
  mockInvoke.mockClear()

  deferUpdates = true
  act(() => { getListener(channel)({ sessionId: two.id, status: 'waiting', code: 0 }) })
  deferUpdates = false
  expect(pending).toHaveLength(1)
  rerender({ active: 'p2', sessions: [fresh] })
  rerender({ active: 'p1', sessions: [one] })
  const snapshot = result.current.sessionsByProject.p2
  expect(snapshot).toEqual([fresh])

  act(() => { pending[0]() })

  // p2 was background both when the event arrived and when the updater ran:
  // neither active-project skip can protect this newer snapshot.
  expect(result.current.sessionsByProject.p2).toBe(snapshot)
  expect(result.current.sessionsByProject.p2).toEqual([fresh])
  expect(mockInvoke).not.toHaveBeenCalled()
})
