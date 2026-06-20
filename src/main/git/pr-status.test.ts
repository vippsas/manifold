import { describe, it, expect } from 'vitest'
import { parsePullRequestStatus } from './pr-status'

describe('parsePullRequestStatus', () => {
  it('normalizes open and closed PR states', () => {
    expect(parsePullRequestStatus('{"state":"OPEN","mergedAt":null}')).toEqual({ state: 'open', mergedAt: null })
    expect(parsePullRequestStatus('{"state":"CLOSED","mergedAt":null}')).toEqual({ state: 'closed', mergedAt: null })
  })

  it('treats a mergedAt timestamp as merged', () => {
    expect(parsePullRequestStatus('{"state":"CLOSED","mergedAt":"2026-06-01T12:00:00Z"}')).toEqual({
      state: 'merged',
      mergedAt: '2026-06-01T12:00:00Z',
    })
  })
})
