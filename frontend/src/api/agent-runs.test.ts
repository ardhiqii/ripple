// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRun, streamRun } from './agent-runs'

afterEach(() => vi.unstubAllGlobals())

describe('agent run API adapter', () => {
  it('creates a run through the generated API contract and preserves idempotency', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ run_id: 'run-1', event_id: 'event-1', state: 'queued', stream_url: '/api/v1/runs/run-1/stream' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createRun('event-1', 'idem-1')).resolves.toEqual({ runId: 'run-1', eventId: 'event-1', state: 'queued', streamUrl: '/api/v1/runs/run-1/stream' })
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/events/event-1/runs', expect.objectContaining({ method: 'POST', headers: expect.any(Headers) }))
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get('Idempotency-Key')).toBe('idem-1')
  })

  it('parses ordered SSE frames and reconnects with the last sequence', async () => {
    const text = 'id: 3\nevent: plan\ndata: {"run_id":"run-1","seq":3,"type":"plan","timestamp":"2026-10-13T10:00:02Z","phase":"complete","public":{"summary":"Plan ready"}}\n\nid: 4\nevent: done\ndata: {"run_id":"run-1","seq":4,"type":"done","timestamp":"2026-10-13T10:00:03Z","phase":"complete","public":{"status":"completed"}}\n\n'
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close() } })
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    const events: unknown[] = []

    await streamRun('run-1', { after: 2, onEvent: (event) => events.push(event) })

    expect(events).toEqual([
      expect.objectContaining({ seq: 3, type: 'plan', public: { summary: 'Plan ready' } }),
      expect.objectContaining({ seq: 4, type: 'done' }),
    ])
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/runs/run-1/stream?after=2', expect.objectContaining({ headers: expect.any(Headers) }))
    expect(new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get('Last-Event-ID')).toBe('2')
  })

  it('ignores heartbeat and malformed or private-only frames', async () => {
    const text = ': heartbeat\n\nid: 1\nevent: heartbeat\ndata: {"run_id":"run-1","seq":1,"type":"heartbeat","public":null}\n\nid: 2\nevent: step\ndata: not-json\n\n'
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(text)); controller.close() } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))
    const onEvent = vi.fn()

    await streamRun('run-1', { onEvent })

    expect(onEvent).not.toHaveBeenCalled()
  })
})
