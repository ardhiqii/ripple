// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { setActiveScenarioContext } from '@/api/transport'

import { fetchPlanDetail } from './plan-api'

afterEach(() => {
  vi.unstubAllGlobals()
  setActiveScenarioContext('A-12-base', ['A-12-base'])
})

describe('plan API adapter', () => {
  it('loads the requested server plan without a fixture fallback', async () => {
    const planId = 'server-plan-1'
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: planId,
      event_id: 'server-event-1',
      run_id: 'server-run-1',
      version: 3,
      verdict: 'conditional',
      recommended_option_id: 'server-option-1',
      base_schedule_version: 7,
      status: 'proposed',
      explanation: { planner: 'Server explanation' },
      counterfactual: null,
      options: [{ id: 'server-option-1', plan_id: planId, label: 'Server option', solver_status: 'feasible', objective_value: 8, changes: [], conditions: [], kpi: { jobs_moved: 2 }, violations: [], rank: 1, is_recommended: true }],
      evidence: [],
      lineage: [{ id: planId, event_id: 'server-event-1', run_id: 'server-run-1', version: 3, verdict: 'conditional', status: 'proposed', supersedes_plan_id: null, created_at: '2026-10-15T08:00:00Z' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    setActiveScenarioContext('fleet-scale', ['A-12-base', 'fleet-scale'])

    const plan = await fetchPlanDetail(planId)

    expect(plan).toMatchObject({ id: planId, eventId: 'server-event-1', runId: 'server-run-1', version: 3, baseScheduleVersion: 7, status: 'proposed' })
    expect(plan.options[0]).toMatchObject({ id: 'server-option-1', label: 'Server option' })
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(`/api/v1/plans/${planId}`)
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })

  it('surfaces a server not-found response instead of returning A-12 data', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unknown_entity', message: 'The requested plan does not exist.' } }), { status: 404, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetcher)

    await expect(fetchPlanDetail('unknown-plan')).rejects.toMatchObject({ status: 404, code: 'unknown_entity' })
  })
})
