// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { server } from './server'
import { recordedEventsAfter, recordedRunEvents, a12PlanFixture } from './plan-fixtures'

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('shared API fixtures', () => {
  it('serves schedule and readiness through the /api/v1 contract', async () => {
    const schedule = await fetch('http://localhost/api/v1/schedule')
    const readiness = await fetch('http://localhost/api/v1/readiness')

    expect(schedule.status).toBe(200)
    expect((await schedule.json()).scenario_id).toBe('A-12-base')
    expect(readiness.status).toBe(200)
    expect((await readiness.json()).items).toHaveLength(2)
  })

  it('covers conflict, validation, server error, and offline paths', async () => {
    const conflict = await fetch('http://localhost/api/v1/readiness/ready-a12-test?scenario=version-conflict', {
      method: 'PATCH',
    })
    const validation = await fetch('http://localhost/api/v1/events?scenario=validation-error', { method: 'POST' })
    const serverError = await fetch('http://localhost/api/v1/policy/data-health?scenario=server-error')
    const offline = fetch('http://localhost/api/v1/events?scenario=offline')

    expect(conflict.status).toBe(409)
    expect(validation.status).toBe(422)
    expect(serverError.status).toBe(500)
    await expect(offline).rejects.toThrow()
  })

  it('keeps plan types and recorded SSE sequences reconnectable', async () => {
    const plan = await fetch('http://localhost/api/v1/plans/00000000-0000-0000-0000-000000000201')
    const stream = await fetch(
      'http://localhost/api/v1/runs/00000000-0000-0000-0000-000000000101/stream?after=2',
    )

    expect(plan.status).toBe(200)
    expect((await plan.json()).recommended_option_id).toBe(a12PlanFixture.recommended_option_id)
    expect(recordedRunEvents.map((event) => event.seq)).toEqual([1, 2, 3, 4])
    expect(recordedEventsAfter(2).map((event) => event.seq)).toEqual([3, 4])
    expect(stream.status).toBe(200)
    expect(await stream.text()).toContain('id: 3\nevent: plan')
    expect((await fetch('http://localhost/api/v1/plans/00000000-0000-0000-0000-000000000202')).status).toBe(200)
    expect((await fetch('http://localhost/api/v1/plans/00000000-0000-0000-0000-000000000203')).status).toBe(200)
  })
})
