// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/components/ui'
import { readinessTestRows } from '@/features/readiness/readiness-test-fixtures'
import type { ReadinessUpdate } from '@/features/readiness/readiness-data'
import type { ReadinessSearch } from '@/routes/search-schemas'
import { ReadinessBoard } from './readiness-board'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const data = { scenarioId: 'A-12-base', scheduleVersion: 1, items: readinessTestRows, summary: { total: 8, at_risk: 4, stale: 3, low_confidence: 2, blocked: 1 }, totalCount: 2 }
const renderBoard = (updateStatus?: ReadinessUpdate, options?: { data?: typeof data; onSearchChange?: (patch: Partial<ReadinessSearch>) => void; onOpenJob?: (jobId: string) => void }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Harness() {
    const [search, setSearch] = useState<ReadinessSearch>({})
    const onSearchChange = (patch: Partial<ReadinessSearch>) => {
      setSearch((current) => ({ ...current, ...patch }))
      options?.onSearchChange?.(patch)
    }
    return <ReadinessBoard data={options?.data ?? data} search={search} onSearchChange={onSearchChange} onOpenJob={options?.onOpenJob ?? vi.fn()} updateStatus={updateStatus ?? (async () => undefined)} />
  }
  return render(<QueryClientProvider client={queryClient}><Harness /><Toaster /></QueryClientProvider>)
}

describe('ReadinessBoard', () => {
  it('uses the server summary and labels its scenario-wide scope', () => {
    renderBoard()

    expect(screen.getByText('Scenario-wide summary')).toBeInTheDocument()
    expect(screen.getByText('Scenario items')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('2 server-filtered items in queue')).toBeInTheDocument()
  })

  it('renders ETA, required-by, effective slack, and a next action', () => {
    renderBoard()

    expect(screen.getByText('D+5')).toBeInTheDocument()
    expect(screen.getAllByText('D+10')).toHaveLength(2)
    expect(screen.getByText(/range D\+2–D\+4/)).toBeInTheDocument()
    expect(screen.getAllByText('0d')).toHaveLength(2)
    expect(screen.getByText('4h old')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('Review timing')).toBeInTheDocument()
    expect(screen.getByText('Resolve blocker')).toBeInTheDocument()
  })

  it('optimistically checks a readiness item and rolls back after a rejected mutation', async () => {
    const user = userEvent.setup()
    let rejectUpdate: (reason?: unknown) => void = () => undefined
    const updateStatus = vi.fn<ReadinessUpdate>(() => new Promise<void>((_, reject) => {
      rejectUpdate = reject
    }))

    renderBoard(updateStatus)
    const checkbox = screen.getByRole('checkbox', { name: 'Mark ready-a12-test ready' })
    expect(checkbox).not.toBeChecked()

    await user.click(checkbox)
    expect(checkbox).toBeChecked()
    expect(updateStatus).toHaveBeenCalledWith('ready-a12-test', 'ready', 1)

    rejectUpdate(new Error('version conflict'))
    await waitFor(() => expect(checkbox).not.toBeChecked())
    expect(screen.getByRole('alert')).toHaveTextContent('Readiness update rolled back')
  })

  it('keeps a server-confirmed ready state after remount', async () => {
    const user = userEvent.setup()
    const updatedRows = readinessTestRows.map((row) => row.id === 'ready-a12-test' ? { ...row, status: 'ready' as const, row_version: 2 } : row)
    const updateStatus = vi.fn<ReadinessUpdate>(async () => updatedRows[0])
    const view = renderBoard(updateStatus)

    await user.click(screen.getByRole('checkbox', { name: 'Mark ready-a12-test ready' }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark ready-a12-test ready' })).toBeChecked())
    view.unmount()

    renderBoard(updateStatus, { data: { ...data, items: updatedRows } })
    expect(screen.getByRole('checkbox', { name: 'Mark ready-a12-test ready' })).toBeChecked()
  })

  it('hands the canonical source reference back to the server search', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn<(patch: Partial<ReadinessSearch>) => void>()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      scenario_id: 'A-12-base',
      schedule_version: 1,
      item: readinessTestRows[0],
      source: { source_type: 'vendor_update', source_reference: 'synthetic-vendor-update-01', last_updated: '2026-10-13T00:00:00Z', confidence: 'medium', stale: false, freshness_hours: 4 },
      suggestion: null,
      history: [],
    }), { status: 200 })))
    renderBoard(undefined, { onSearchChange })

    await user.click(screen.getByRole('button', { name: /ready-a12-test/ }))
    await user.click(await screen.findByRole('button', { name: 'Find items from this source' }))
    expect(onSearchChange).toHaveBeenCalledWith({ q: 'synthetic-vendor-update-01', item: undefined })
  })

  it('renders the complete source chain and detail history', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      scenario_id: 'A-12-base',
      schedule_version: 1,
      item: readinessTestRows[0],
      source: { source_type: 'vendor_update', source_reference: 'synthetic-vendor-update-01', last_updated: '2026-10-13T00:00:00Z', confidence: 'medium', stale: false, freshness_hours: 4 },
      suggestion: { id: 'suggestion-1', event_id: 'event-1', readiness_item_id: 'ready-a12-test', proposed_patch: { planned_day: 4 }, source_excerpt: 'Current vendor source', confidence: 0.8, base_row_version: 1, state: 'pending', review_actor: null, review_note: null, created_at: '2026-10-13T00:00:00Z', reviewed_at: null },
      history: [{ id: 'suggestion-0', event_id: 'event-0', readiness_item_id: 'ready-a12-test', proposed_patch: { planned_day: 3 }, source_excerpt: 'Previous source handoff', confidence: 0.6, base_row_version: 1, state: 'rejected', review_actor: 'planner', review_note: 'Needs a newer ETA', created_at: '2026-10-12T00:00:00Z', reviewed_at: '2026-10-12T01:00:00Z' }],
    }), { status: 200 })))
    renderBoard()

    await user.click(screen.getByRole('button', { name: /ready-a12-test/ }))
    expect(await screen.findByRole('region', { name: 'Readiness source chain' })).toHaveTextContent('synthetic-vendor-update-01')
    expect(screen.getByRole('region', { name: 'Readiness detail history' })).toHaveTextContent('Previous source handoff')
    expect(screen.getByRole('region', { name: 'Readiness detail history' })).toHaveTextContent('Needs a newer ETA')
  })
})
