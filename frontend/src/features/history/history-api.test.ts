import { describe, expect, it, vi } from 'vitest'

import { fetchAllDecisionPages } from './history-api'

describe('decision history API', () => {
  it('loads every cursor page with the server filter scope intact', async () => {
    const decisions = Array.from({ length: 121 }, (_, index) => ({
      id: `decision-${index + 1}`,
      plan_id: 'plan-1',
      selected_option_id: null,
      action: 'approve',
      actor: 'planner.demo',
      reason: `Decision ${index + 1}`,
      category: 'operational_change',
      acknowledged_condition_ids: [],
      schedule_version_before: 1,
      schedule_version_after: 2,
      created_at: '2026-09-29T10:30:00Z',
    }))
    const pages = [decisions.slice(0, 40), decisions.slice(40, 80), decisions.slice(80)]
    const fetcher = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const after = url.searchParams.get('after')
      const pageIndex = after === 'cursor-2' ? 2 : after === 'cursor-1' ? 1 : 0
      return new Response(JSON.stringify({
        decisions: pages[pageIndex],
        next_cursor: pageIndex < pages.length - 1 ? `cursor-${pageIndex + 1}` : null,
        total_count: decisions.length,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const result = await fetchAllDecisionPages({
      action: 'approve',
      planId: ' plan-1 ',
      jobId: 'job-7',
      actor: 'planner.demo',
      nature: 'disruption',
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'vendor',
      limit: 40,
    }, fetcher)

    expect(result.decisions).toHaveLength(121)
    expect(result.total_count).toBe(121)
    expect(result.next_cursor).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(3)

    const firstUrl = new URL(String(fetcher.mock.calls[0][0]), 'http://localhost')
    expect(Object.fromEntries(firstUrl.searchParams)).toEqual({
      action: 'approve',
      plan_id: 'plan-1',
      job_id: 'job-7',
      actor: 'planner.demo',
      nature: 'disruption',
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'vendor',
      limit: '40',
    })
    const secondUrl = new URL(String(fetcher.mock.calls[1][0]), 'http://localhost')
    expect(secondUrl.searchParams.get('after')).toBe('cursor-1')
    const thirdUrl = new URL(String(fetcher.mock.calls[2][0]), 'http://localhost')
    expect(thirdUrl.searchParams.get('after')).toBe('cursor-2')

    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('A-12-base')
    }
  })
})
