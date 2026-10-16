// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveScenarioContext } from '@/api/transport'

import { fetchReadiness, fetchReadinessDetail, patchReadiness } from './readiness-api'

const item = {
  id: 'ready-1', job_id: 'A-12', stage: 'test-bay', step_order: 1, lead_time_days: 2,
  planned_day: 3, eta_earliest: 2, eta_latest: 4, confidence: 'medium', status: 'pending',
  source_type: 'vendor_update', source_reference: 'synthetic-source', last_updated: '2026-10-13T00:00:00Z',
  not_before_day: 2, risk_buffer_days: 1, row_version: 3, required_by: 5, effective_eta: 4,
  slack: 1, effective_slack: 0, stale: false, freshness_hours: 4, feasible_for_target: true,
  earliest_feasible_start: 5, plan_on_latest: false, vendor_expedite_required: false, notes: ['Synthetic'],
}

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

describe('readiness API adapter', () => {
  it('uses server filters, maps row/version fields, and sends expected row version on PATCH', async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input)
      if (path.includes('/readiness/ready-1') && init?.method === 'PATCH') {
        return Promise.resolve(new Response(JSON.stringify({ item: { ...item, status: 'ready', row_version: 4 }, schedule_version: 2 }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ scenario_id: 'A-12-base', schedule_version: 1, items: [item], summary: { total: 1, at_risk: 1, stale: 0, low_confidence: 1, blocked: 0 }, total_count: 1 }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetcher)

    const list = await fetchReadiness({ job: 'A-12', confidence: 'medium', q: 'vendor', risk: 'critical' })
    const updated = await patchReadiness('ready-1', 'ready', 3)

    expect(list.items[0]).toMatchObject({ id: 'ready-1', row_version: 3, status: 'pending' })
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('job_id=A-12')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('risk=at_risk')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Scenario-ID')).toBe('A-12-base')
    expect(updated).toMatchObject({ status: 'ready', row_version: 4 })
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ status: 'ready', expected_row_version: 3 })
  })

  it('reads the server-confirmed status again after a remount-style refetch', async () => {
    let persistedItem = { ...item }
    const fetcher = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        persistedItem = { ...persistedItem, status: 'ready', row_version: 4 }
        return Promise.resolve(new Response(JSON.stringify({ item: persistedItem, schedule_version: 2 }), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ scenario_id: 'A-12-base', schedule_version: 2, items: [persistedItem], summary: { total: 1, at_risk: 0, stale: 0, low_confidence: 0, blocked: 0 }, total_count: 1 }), { status: 200 }))
    })
    vi.stubGlobal('fetch', fetcher)

    expect((await fetchReadiness()).items[0]?.status).toBe('pending')
    await patchReadiness('ready-1', 'ready', 3)
    expect((await fetchReadiness()).items[0]).toMatchObject({ status: 'ready', row_version: 4 })
  })

  it('maps detail source and suggestion without relying on a fixture fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      scenario_id: 'A-12-base', schedule_version: 1, item, source: { source_type: 'vendor_update', source_reference: 'synthetic-source', last_updated: item.last_updated, confidence: 'medium', stale: false, freshness_hours: 4 }, suggestion: { id: 'suggestion-1', event_id: 'event-1', readiness_item_id: 'ready-1', proposed_patch: { planned_day: 4 }, source_excerpt: 'Synthetic excerpt', confidence: 0.8, base_row_version: 3, state: 'pending', review_actor: null, review_note: null, created_at: item.last_updated, reviewed_at: null }, history: [{ id: 'suggestion-0', event_id: 'event-0', readiness_item_id: 'ready-1', proposed_patch: { planned_day: 3 }, source_excerpt: 'Previous excerpt', confidence: 0.5, base_row_version: 2, state: 'rejected', review_actor: 'planner', review_note: 'Superseded', created_at: item.last_updated, reviewed_at: item.last_updated }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    const detail = await fetchReadinessDetail('ready-1')
    expect(detail.item.id).toBe('ready-1')
    expect(detail.source.sourceReference).toBe('synthetic-source')
    expect(detail.suggestion?.proposedPatch).toEqual({ planned_day: 4 })
    expect(detail.history).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({ eventId: 'event-0', state: 'rejected', reviewNote: 'Superseded' })
  })
})
