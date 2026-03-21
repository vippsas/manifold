import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MemoryPanelContent } from './MemoryPanelContent'
import type { UseMemoryResult } from '../../hooks/useMemory'
import type { MemoryTimelineItem } from '../../../shared/memory-types'

function makeMemory(timeline: MemoryTimelineItem[]): UseMemoryResult {
  return {
    searchResults: [],
    stats: null,
    timeline,
    error: null,
    isSearching: false,
    searchQuery: '',
    setSearchQuery: vi.fn(),
    search: vi.fn().mockResolvedValue(undefined),
    loadTimeline: vi.fn().mockResolvedValue(undefined),
    loadStats: vi.fn().mockResolvedValue(undefined),
    deleteObservation: vi.fn().mockResolvedValue(undefined),
    clearMemory: vi.fn().mockResolvedValue(undefined),
    timelineHasMore: false,
  }
}

describe('MemoryPanelContent', () => {
  it('does not duplicate interaction text in expanded timeline items', () => {
    const summary = 'Only reference to the main file aks-workload-isolation-and-least-privilege-findings.md as this references to the rest'

    const memory = makeMemory([
      {
        id: 'interaction-1',
        projectId: 'project-1',
        sessionId: 'session-1',
        source: 'interaction',
        type: 'task_summary',
        title: 'You',
        summary,
        role: 'user',
        createdAt: Date.now(),
      },
    ])

    render(<MemoryPanelContent memory={memory} />)

    fireEvent.click(screen.getByText('You'))

    expect(screen.getAllByText(summary)).toHaveLength(1)
  })

  it('keeps session metadata without repeating the summary block', () => {
    const summary = 'Consolidated the memory panel card layout to avoid repeated content.'

    const memory = makeMemory([
      {
        id: 'summary-1',
        projectId: 'project-1',
        sessionId: 'session-1',
        source: 'session_summary',
        type: 'task_summary',
        title: 'Tighten memory card details',
        summary,
        runtimeId: 'codex',
        branchName: 'memory-cleanup',
        whatWasLearned: 'Interaction-backed memory entries should not repeat the visible summary in expanded state.',
        decisionsMade: ['Only show detail sections when there is additional metadata.'],
        filesChanged: ['src/renderer/components/memory/MemoryPanelContent.tsx'],
        createdAt: Date.now(),
      },
    ])

    render(<MemoryPanelContent memory={memory} />)

    fireEvent.click(screen.getByText('Tighten memory card details'))

    expect(screen.getAllByText(summary)).toHaveLength(1)
    expect(screen.getByText(/Learned:/)).toBeInTheDocument()
    expect(screen.getByText(/Interaction-backed memory entries should not repeat/)).toBeInTheDocument()
    expect(
      screen.queryByText((_, element) => element?.textContent?.startsWith('Summary:') ?? false),
    ).not.toBeInTheDocument()
  })
})
