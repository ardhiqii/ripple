// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveScenarioContext } from '@/api/transport'

import { adaptEventDetail, adaptEventList, fetchEventList, mapServerLifecycle, startEventRun } from './events-api'

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

describe('events API adapter', () => {
  it('uses server filters and opaque cursor while mapping lifecycle labels', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      events: [{
        id: 'live-event-1', nature: 'disruption', cause: 'Weather delay', state: 'planning', extraction_version: 0,
        raw_text_preview: 'Weather source', created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z',
        job_ids: ['D-07'], latest_run_id: null, latest_run_state: null, latest_plan_id: null, latest_plan_status: null,
      }], next_cursor: 'opaque-next', total_count: 3, scenario_lifecycle_counts: { reading_input: 1 },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    setActiveScenarioContext('fleet-scale', ['A-12-base', 'fleet-scale'])

    const result = await fetchEventList({ nature: 'disruption', state: 'planning', job: 'D-07', q: ' weather ' }, 'opaque-after')

    expect(result.items[0]).toMatchObject({ id: 'live-event-1', lifecycle: 'extracting', jobs: ['D-07'] })
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('nature=disruption')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('state=planning')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('job_id=D-07')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('after=opaque-after')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('q=weather')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })

  it('loads detail independently and preserves server extraction/version fields', () => {
    const detail = adaptEventDetail({
      event: { id: 'live-event-2', nature: 'disruption', cause: 'Vendor delay', raw_text: 'Vendor says D-07 is late', state: 'extracted', extraction_version: 2, created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:01:00Z' },
      extractions: [{ version: 2, extracted_json: { nature: 'disruption', cause: 'Corrected vendor delay', job_ids: ['D-07'], requested_start: 9, missing_info: [], source_excerpt: 'D-07 is late' } }],
      runs: [], plans: [],
    })

    expect(detail.event).toMatchObject({ id: 'live-event-2', lifecycle: 'ready', extractionVersion: 2, jobs: ['D-07'], requestedDate: 9, sourceSentences: ['D-07 is late'] })
    expect(detail.event.extraction?.cause).toBe('Corrected vendor delay')
  })

  it('never turns an unknown or closed server combination into approved', () => {
    expect(mapServerLifecycle('closed', undefined, undefined)).toBe('integrity_error')
    expect(mapServerLifecycle('extracted', 'unknown', undefined)).toBe('integrity_error')
    expect(mapServerLifecycle('extracted', undefined, 'unknown')).toBe('integrity_error')
    expect(mapServerLifecycle('received', undefined, 'approved')).toBe('approved')
    expect(mapServerLifecycle('planning', 'completed', undefined, 'run-1', null)).toBe('running')
    expect(mapServerLifecycle('planning', 'running', undefined, null, null)).toBe('integrity_error')
    expect(mapServerLifecycle('planning', undefined, 'proposed', null, null)).toBe('integrity_error')
    expect(adaptEventList({ events: [], next_cursor: null, total_count: 0, scenario_lifecycle_counts: {} }).totalCount).toBe(0)
  })

  it('keeps a completed run in investigating while marking a missing plan explicitly', () => {
    const result = adaptEventList({
      events: [{
        id: 'event-pending-plan', state: 'extracted', nature: 'request', cause: 'Completed investigation',
        raw_text_preview: 'source', created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z',
        extraction_version: 1, job_ids: [], latest_run_id: 'run-1', latest_run_state: 'completed', latest_plan_id: null, latest_plan_status: null,
      }], next_cursor: null, total_count: 1, scenario_lifecycle_counts: {},
    })
    expect(result.items[0]).toMatchObject({ lifecycle: 'running', pendingPlan: true })
  })

  it('does not let an approved plan hide an unknown event state', () => {
    const result = adaptEventDetail({
      event: { id: 'event-unknown', state: 'unknown_state', nature: 'request', raw_text: 'source', extraction_version: 0, created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z' },
      extractions: [], runs: [], plans: [{ id: 'plan-1', status: 'approved', created_at: '2026-10-13T09:00:00Z' }],
    })
    expect(result.event.lifecycle).toBe('integrity_error')
  })

  it('flags linked run or plan records that omit their identity/state pair', () => {
    const result = adaptEventDetail({
      event: { id: 'event-malformed', state: 'extracted', nature: 'request', raw_text: 'source', extraction_version: 0, created_at: '2026-10-13T08:00:00Z', updated_at: '2026-10-13T08:00:00Z' },
      extractions: [], runs: [{ started_at: '2026-10-13T09:00:00Z' }], plans: [],
    })
    expect(result.event.lifecycle).toBe('integrity_error')
  })

  it('reuses the same retry idempotency key when a request is retried', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ run_id: 'run-1', event_id: 'event-1', state: 'queued', extraction_version: 1 }), { status: 201 })))
    vi.stubGlobal('fetch', fetcher)

    await startEventRun('event-1', { retry: true, idempotencyKey: 'ripple-event-1-retry-run-1' })
    await startEventRun('event-1', { retry: true, idempotencyKey: 'ripple-event-1-retry-run-1' })

    const keys = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers).get('Idempotency-Key'))
    expect(keys).toEqual(['ripple-event-1-retry-run-1', 'ripple-event-1-retry-run-1'])
  })
})
