// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveScenarioContext } from '@/api/transport'

import { fetchSchedule } from './schedule-api'

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

describe('schedule API adapter', () => {
  it('requests the active scenario and documented range/group filters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      scenario_id: 'fleet-scale', version: 4, from_day: 2, to_day: 5,
      jobs: [], resources: [], bookings: [], weather: [], capacity: [],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    setActiveScenarioContext('fleet-scale', ['A-12-base', 'fleet-scale'])

    const schedule = await fetchSchedule({ fromDay: 2, toDay: 5, groups: ['Supply boats'] })

    expect(schedule.scenarioId).toBe('fleet-scale')
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('/api/v1/schedule?from=2&to=5&groups=supply_boat')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })
})
