// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveScenarioContext } from '@/api/transport'
import { RunRegistryProvider, useRunRegistry } from '@/features/agent/run-registry'
import { eventLifecycleMeta } from '@/features/events/events-data'
import type { ChangesSearch } from '@/routes/search-schemas'
import { ChangeInbox } from './change-inbox'

vi.mock('@tanstack/react-router', () => ({ useBlocker: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

function renderInbox(initialSearch: ChangesSearch = {}) {
  const onOpenPlan = vi.fn()
  const onSearchChange = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={queryClient}><ChangeInbox search={initialSearch} onSearchChange={onSearchChange} onOpenPlan={onOpenPlan} /></QueryClientProvider>)
  return { ...view, onOpenPlan, onSearchChange }
}

const liveEvent = {
  id: 'event-live-a', nature: 'request', cause: 'Live server event', state: 'extracted', extraction_version: 0,
  raw_text_preview: 'Live source text', created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z',
  job_ids: ['A-12'], latest_run_id: null, latest_run_state: null, latest_plan_id: null, latest_plan_status: null,
}

function listPayload(events: unknown[] = [liveEvent]) {
  return { events, next_cursor: null, total_count: events.length, scenario_lifecycle_counts: { draft: 0, reading_input: 0, needs_clarification: 0, ready_to_investigate: 1, investigating: 0, options_ready: 0, stale: 0, approved: 0, rejected: 0, superseded: 0, failed: 0, integrity_error: 0 } }
}

function detailPayload() {
  return { event: { ...liveEvent, raw_text: liveEvent.raw_text_preview }, extractions: [], runs: [], plans: [] }
}

function readyDetailPayload() {
  return {
    event: { ...liveEvent, raw_text: liveEvent.raw_text_preview, extraction_version: 1 },
    extractions: [{ version: 1, extracted_json: { nature: 'request', cause: 'Live server event', job_ids: ['A-12'], requested_start: 5, missing_info: [], source_excerpt: 'Live source text' } }],
    runs: [],
    plans: [],
  }
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ChangeInbox', () => {
  it('registers the server run and event IDs in the scenario-scoped registry', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes(`/events/${liveEvent.id}/runs`) && init?.method === 'POST') return Promise.resolve(response({ run_id: 'run-server-1', event_id: 'event-server-1', state: 'queued', extraction_version: 1 }))
      if (url.includes(`/events/${liveEvent.id}`)) return Promise.resolve(response(readyDetailPayload()))
      return Promise.resolve(response(listPayload()))
    })
    vi.stubGlobal('fetch', fetcher)

    function RegistryProbe() {
      const { activeRuns } = useRunRegistry()
      return <output role="status">{activeRuns.map((run) => `${run.runId}:${run.eventId}:${run.scenarioId}`).join(',')}</output>
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><RunRegistryProvider><RegistryProbe /><ChangeInbox search={{ event: liveEvent.id }} onSearchChange={vi.fn()} onOpenPlan={vi.fn()} /></RunRegistryProvider></QueryClientProvider>)

    await user.click(await screen.findByRole('button', { name: 'Edit extraction' }))
    await user.click(screen.getByRole('button', { name: 'Start investigation' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('run-server-1:event-server-1:A-12-base'))
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes(`/events/${liveEvent.id}/runs`) && init?.method === 'POST')).toBe(true)
  })

  it('offers a clear reset when filters produce no results', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(listPayload([]))))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><ChangeInbox search={{ q: 'does-not-exist' }} onSearchChange={onSearchChange} onOpenPlan={vi.fn()} /></QueryClientProvider>)

    expect(await screen.findByText('No server events match these filters.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(onSearchChange).toHaveBeenCalledWith({ q: undefined, nature: undefined, state: undefined, job: undefined })
  })

  it('keeps clear filters available when filtered results remain', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(listPayload())))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><ChangeInbox search={{ q: 'live' }} onSearchChange={onSearchChange} onOpenPlan={vi.fn()} /></QueryClientProvider>)

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }))
    expect(onSearchChange).toHaveBeenCalledWith({ q: undefined, nature: undefined, state: undefined, job: undefined })
  })

  it('retries a failed run with a new server idempotency key and preserves returned state', async () => {
    const user = userEvent.setup()
    const failedEvent = { ...liveEvent, id: 'event-failed-a', latest_run_id: 'run-failed-a', latest_run_state: 'failed' }
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes(`/events/${failedEvent.id}/runs`) && init?.method === 'POST') return Promise.resolve(response({ run_id: 'run-retry-1', event_id: failedEvent.id, state: 'running', extraction_version: 1 }))
      return Promise.resolve(response(listPayload([failedEvent])))
    })
    vi.stubGlobal('fetch', fetcher)

    function RegistryProbe() {
      const { activeRuns } = useRunRegistry()
      return <output role="status">{activeRuns.map((run) => `${run.runId}:${run.status}`).join(',')}</output>
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><RunRegistryProvider><RegistryProbe /><ChangeInbox search={{}} onSearchChange={vi.fn()} onOpenPlan={vi.fn()} /></RunRegistryProvider></QueryClientProvider>)

    await user.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('run-retry-1:streaming'))
    const runRequest = fetcher.mock.calls.find(([input, init]) => String(input).includes(`/events/${failedEvent.id}/runs`) && init?.method === 'POST')
    expect(new Headers(runRequest?.[1]?.headers).get('Idempotency-Key')).toMatch(new RegExp(`^ripple-${failedEvent.id}-retry-`))
  })

  it('labels a completed run without a plan as plan pending', async () => {
    const completedEvent = { ...liveEvent, id: 'event-pending-plan', latest_run_id: 'run-complete-a', latest_run_state: 'completed' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(listPayload([completedEvent]))))
    renderInbox()

    expect(await screen.findByText('Plan pending')).toBeInTheDocument()
  })

  it('shows a recoverable state for a stale direct event link', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => String(input).includes('/events/missing-event')
      ? Promise.resolve(response({ code: 'unknown_entity', message: 'Event is not in this scenario.' }, 404))
      : Promise.resolve(response(listPayload()))))
    const { onSearchChange } = renderInbox({ event: 'missing-event' })

    expect(await screen.findByText(/not available in the active scenario/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to inbox' }))
    expect(onSearchChange).toHaveBeenCalledWith({ event: undefined })
  })

  it('shows a retryable error when refresh cannot refetch the server list', async () => {
    const user = userEvent.setup()
    let listRequests = 0
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/events?')) {
        listRequests += 1
        return Promise.resolve(listRequests === 2 ? response({ code: 'database_unavailable', message: 'Database unavailable.' }, 503) : response(listPayload()))
      }
      return Promise.resolve(response(detailPayload()))
    })
    vi.stubGlobal('fetch', fetcher)

    renderInbox()
    await screen.findByRole('button', { name: /event-live-a/ })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText(/Inbox refresh failed/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry action' }))
    await waitFor(() => expect(listRequests).toBe(3))
  })

  it('opens a ready extraction for review before investigation', async () => {
    const user = userEvent.setup()
    const fetcher = vi.fn().mockResolvedValue(response(listPayload()))
    vi.stubGlobal('fetch', fetcher)
    const { onSearchChange } = renderInbox()

    await user.click(await screen.findByRole('button', { name: eventLifecycleMeta.ready.primaryAction }))

    expect(onSearchChange).toHaveBeenCalledWith({ event: liveEvent.id })
    expect(fetcher.mock.calls.some(([input, init]) => String(input).includes('/runs') && init?.method === 'POST')).toBe(false)
  })

  it('returns focus to the event row after its preview closes', async () => {
    const user = userEvent.setup()
    const item = liveEvent
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: RequestInfo | URL) => String(input).includes('/api/v1/events/event-live-a') ? Promise.resolve(response(detailPayload())) : Promise.resolve(response(listPayload()))))
    function Harness() {
      const [search, setSearch] = useState<ChangesSearch>({})
      return <ChangeInbox search={search} onSearchChange={(patch) => setSearch((current) => ({ ...current, ...patch }))} onOpenPlan={vi.fn()} />
    }

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>)
    const trigger = await screen.findByRole('button', { name: new RegExp(item.id) })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
