// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'

import { ApiError, createApiTransport, scenarioQueryKey } from './transport'

describe('scenario-aware API transport', () => {
  it('adds the active scenario to GET, PATCH, POST, and SSE requests', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })))
    const transport = createApiTransport({ scenarioId: 'fleet-scale', allowedScenarioIds: ['fleet-scale'], fetcher })

    await transport.get('/api/v1/schedule')
    await transport.patch('/api/v1/readiness/item-1', { status: 'ready' })
    await transport.post('/api/v1/events', { raw_text: 'delay' })
    await transport.openSse('/api/v1/runs/run-1/stream')

    expect(fetcher).toHaveBeenCalledTimes(4)
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
    }
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('Accept')).toBe('text/event-stream')
  })

  it('normalizes backend errors and rejects unknown scenarios before sending', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'unknown_scenario', message: 'Unknown scenario.', request_id: 'req-1', details: { scenario_id: 'bad' } } }), { status: 404 }))
    const transport = createApiTransport({ scenarioId: 'A-12-base', allowedScenarioIds: ['A-12-base'], fetcher })

    await expect(transport.get('/api/v1/schedule', { scenarioId: 'bad' })).rejects.toMatchObject({ status: 400, code: 'scenario_context_mismatch' })
    await expect(transport.get('/api/v1/schedule')).rejects.toMatchObject({ status: 404, code: 'unknown_scenario', requestId: 'req-1', details: { scenario_id: 'bad' } })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keeps local same-origin and preview-origin paths valid', () => {
    expect(createApiTransport({ scenarioId: 'A-12-base', baseUrl: 'https://api.example.test' }).scenarioId).toBe('A-12-base')
    expect(scenarioQueryKey('fleet-scale', 'schedule', { from: 'D+0' })).toEqual(['scenario', 'fleet-scale', 'schedule', { from: 'D+0' }])
    expect(() => createApiTransport({ scenarioId: ' ', allowedScenarioIds: ['A-12-base'] })).toThrowError(ApiError)
  })
})
