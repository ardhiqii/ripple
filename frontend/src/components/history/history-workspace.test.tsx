// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { historyFixture } from '@/features/history/history-fixtures'
import { HistoryWorkspace } from './history-workspace'

afterEach(() => cleanup())

describe('HistoryWorkspace', () => {
  it('exposes the route-ready immutable history view without owning navigation or fetching', () => {
    render(<HistoryWorkspace data={historyFixture} search={{}} onSearchChange={vi.fn()} onSelectedDecisionChange={vi.fn()} onOpenTimeline={vi.fn()} onOpenSourceEvent={vi.fn()} onOpenDecisionWorkspace={vi.fn()} onStartSimilarChange={vi.fn()} onCopyStableLink={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Decision history' })).toBeInTheDocument()
    expect(screen.getByText('Audit records are read only')).toBeInTheDocument()
  })
})
