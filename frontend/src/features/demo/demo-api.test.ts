import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ApiFetcher } from '@/api/transport'

import { createDemoEventAndStartExtraction, resetDemo } from './demo-api'

afterEach(() => vi.restoreAllMocks())

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('Demo API lifecycle', () => {
  it('sends a matching non-default scenario header and body for reset', async () => {
    const fetcher = vi.fn<ApiFetcher>(async () => jsonResponse({
      scenario_id: 'fleet-scale',
      seed_version: 'fleet-scale-v1',
      seed_checksum: 'fleet-checksum',
      schedule_version: 7,
      reset_at: '2026-10-15T10:00:00Z',
    }))

    await expect(resetDemo('fleet-scale', fetcher)).resolves.toEqual({
      scenarioId: 'fleet-scale',
      seedVersion: 'fleet-scale-v1',
      seedChecksum: 'fleet-checksum',
      scheduleVersion: 7,
      resetAt: '2026-10-15T10:00:00Z',
    })

    const [, init] = fetcher.mock.calls[0]!
    expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
    expect(JSON.parse(String(init?.body))).toEqual({ scenario_id: 'fleet-scale' })
  })

  it('returns the server event ID after extraction starts', async () => {
    const fetcher = vi.fn<ApiFetcher>(async (input) => {
      const path = String(input)
      return path.endsWith('/extract')
        ? jsonResponse({ event_id: 'server-event-id', state: 'extracted', extraction_version: 1, status: 'completed' })
        : jsonResponse({ id: 'server-event-id', raw_text: 'A-12 changed', state: 'received' })
    })

    await expect(createDemoEventAndStartExtraction('A-12 changed', 'fleet-scale', fetcher)).resolves.toBe('server-event-id')
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/v1/events',
      '/api/v1/events/server-event-id/extract',
    ])
    for (const [, init] of fetcher.mock.calls) expect(new Headers(init?.headers).get('X-Scenario-ID')).toBe('fleet-scale')
  })
})
