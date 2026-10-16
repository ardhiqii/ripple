// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { createDemoEvent, fetchDemoScenarios, resetDemo } from '@/features/demo/demo-api'
import { fetchDecisionList } from '@/features/history/history-api'
import { fetchPolicyData } from '@/features/policy/policy-api'

describe('API consumers use the shared scenario transport', () => {
  it('adds the default scenario to history, policy, and demo reads', async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const path = String(input)
      const body = path.includes('/demo/scenarios')
        ? { mode: 'live', scenarios: [] }
        : path.includes('/decisions')
          ? { decisions: [], next_cursor: null, total_count: 0 }
          : {}
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
    })

    await fetchDecisionList({}, fetcher)
    await fetchPolicyData(fetcher)
    await fetchDemoScenarios(fetcher)

    expect(fetcher).toHaveBeenCalledTimes(5)
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('A-12-base')
    }
  })

  it('adds the default scenario to demo POST mutations', async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL, _init?: RequestInit) => {
      const path = String(input)
      const body = path.includes('/demo/reset')
        ? { scenario_id: 'A-12-base', seed_version: 'seed', seed_checksum: 'checksum', schedule_version: 1, reset_at: '2026-10-13T00:00:00Z' }
        : { id: 'event-1' }
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })

    await resetDemo('A-12-base', fetcher)
    await createDemoEvent('synthetic update', fetcher)

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST'])
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('A-12-base')
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    }
  })
})
