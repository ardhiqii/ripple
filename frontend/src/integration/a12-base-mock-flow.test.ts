// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'

const eventId = '00000000-0000-0000-0000-000000000012'
const planId = '00000000-0000-0000-0000-000000000201'

const message = "A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it."

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('A-12 base frontend mock flow', () => {
  it('covers intake, correction, run stream, review, and decision mutations', async () => {
    const create = await fetch('http://localhost/api/v1/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw_text: message, nature: 'request', cause: 'A-12 output dropped.' }),
    })
    expect(create.status).toBe(201)
    const createdEvent = await create.json()
    expect(createdEvent).toMatchObject({
      id: eventId,
      scenario_id: 'A-12-base',
      nature: 'request',
      state: 'received',
      extraction_version: 0,
    })
    expect(createdEvent.raw_text).toBe(message)

    const extraction = await fetch(`http://localhost/api/v1/events/${eventId}/extract`, { method: 'POST' })
    expect(extraction.status).toBe(200)
    expect(await extraction.json()).toEqual({
      event_id: eventId,
      state: 'planning',
      extraction_version: 0,
      status: 'queued',
    })

    const correctionPayload = {
      expected_extraction_version: 0,
      extraction: {
        source_excerpt: message,
        nature: 'request',
        cause: 'A-12 output dropped.',
        job_ids: ['A-12'],
        requested_start: 3,
        objective: 'recover production',
        hard_constraints: [{
          kind: 'fixed_job',
          source_excerpt: "Don't touch B-05, the client is inspecting it.",
          value: 'B-05',
        }],
        soft_preferences: ['minimize delay for A-12'],
        eta_updates: [],
        risk_tags: [],
        levers_ruled_out: [],
        missing_info: [],
      },
    }
    const corrected = await fetch(`http://localhost/api/v1/events/${eventId}/extraction`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(correctionPayload),
    })
    expect(corrected.status).toBe(200)
    const correctedDetail = await corrected.json()
    expect(correctedDetail.event).toMatchObject({ state: 'extracted', extraction_version: 1 })
    expect(correctedDetail.extractions[0]).toMatchObject({
      version: 1,
      corrected: true,
      extracted_json: correctionPayload.extraction,
    })

    const run = await fetch(`http://localhost/api/v1/events/${eventId}/runs`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'a12-base-run-1' },
    })
    expect(run.status).toBe(201)
    const runResponse = await run.json()
    expect(runResponse).toMatchObject({
      event_id: eventId,
      extraction_version: 1,
      state: 'queued',
      attempt: 1,
    })
    expect(runResponse.stream_url).toBe('/api/v1/runs/00000000-0000-0000-0000-000000000101/stream')

    const stream = await fetch(`http://localhost${runResponse.stream_url}`)
    expect(stream.status).toBe(200)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const streamText = await stream.text()
    expect(streamText).toContain('event: plan')
    expect(streamText).toContain('event: done')
    expect(streamText).toContain('Verified plan options are ready for review.')

    const plan = await fetch(`http://localhost/api/v1/plans/${planId}`)
    expect(plan.status).toBe(200)
    const planResponse = await plan.json()
    expect(planResponse.recommended_option_id).toBe('00000000-0000-0000-0000-000000000211')
    const d3Option = planResponse.options.find((option: { changes: Array<{ value: number }>; solver_status: string }) =>
      option.changes.some((change) => change.value === 3))
    expect(d3Option).toMatchObject({ solver_status: 'infeasible' })
    expect(d3Option.violations).toEqual([{ code: 'readiness_blocked', summary: 'Test bay is not ready.' }])

    const recommendedOption = planResponse.options.find((option: { is_recommended: boolean }) => option.is_recommended)
    expect(recommendedOption).toMatchObject({
      label: 'Move A-12 to D+5 with cargo coordination',
      conditions: [expect.objectContaining({ text: expect.stringContaining('D+2') })],
    })
    expect(recommendedOption.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'move_job', target: 'A-12', value: 5 }),
      expect.objectContaining({ kind: 'move_cargo' }),
    ]))

    const approve = await fetch(`http://localhost/api/v1/plans/${planId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'a12-base-approval-1',
      },
      body: JSON.stringify({
        option_id: recommendedOption.id,
        expected_schedule_version: 1,
        acknowledged_condition_ids: ['condition-a12-test'],
      }),
    })
    expect(approve.status).toBe(200)
    const approvalResponse = await approve.json()
    expect(approvalResponse).toMatchObject({
      plan_id: planId,
      schedule_version_before: 1,
      schedule_version_after: 2,
      notification_draft_ids: ['00000000-0000-0000-0000-000000000501'],
    })
    expect(approvalResponse.changed_objects).toHaveLength(2)
    expect(approvalResponse.changed_objects).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity_type: 'job', entity_id: 'A-12', change_kind: 'updated', after: expect.objectContaining({ start_day: 5 }) }),
      expect.objectContaining({ entity_type: 'booking', entity_id: 'cargo-D-07-drums', change_kind: 'updated', after: expect.objectContaining({ start_day: 6, end_day: 6 }) }),
    ]))

    const reject = await fetch(`http://localhost/api/v1/plans/${planId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'a12-base-reject-1' },
      body: JSON.stringify({ reason: 'Vendor test slot is not confirmed.', category: 'readiness', replan: true }),
    })
    expect(reject.status).toBe(200)
    expect(await reject.json()).toMatchObject({ plan_id: planId, action: 'reject', replan_requested: true })

    const reply = await fetch(`http://localhost/api/v1/plans/${planId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'a12-base-reply-1' },
      body: JSON.stringify({ context: 'Ask the vendor to confirm the D+2 test slot.' }),
    })
    expect(reply.status).toBe(200)
    expect(await reply.json()).toMatchObject({ plan_id: planId, action: 'reply', replan_requested: false })
  })
})
