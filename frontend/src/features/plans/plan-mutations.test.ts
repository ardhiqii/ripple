// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PlanMutationError,
  changedObjectIdsFromResponse,
  createPlanMutationClient,
  invalidatePlanMutationQueries,
  parsePlanMutationError,
} from './plan-mutations'

const planId = '00000000-0000-0000-0000-000000000201'

const approvalResponse = {
  decision_id: 'decision-1',
  plan_id: planId,
  schedule_version_before: 4,
  schedule_version_after: 5,
  changed_objects: [{ entity_type: 'job', entity_id: 'A-12', change_kind: 'updated', before: {}, after: {} }],
  notification_draft_ids: [],
}

const decisionResponse = (action: 'reject' | 'reply') => ({
  decision_id: `decision-${action}`,
  plan_id: planId,
  action,
  replan_requested: action === 'reject',
})

afterEach(() => vi.restoreAllMocks())

describe('plan mutation client', () => {
  it('sends generated request payloads and an idempotency key for approve, reject, and reply', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approvalResponse), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(decisionResponse('reject')), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(decisionResponse('reply')), { status: 200 }))
    const client = createPlanMutationClient({ fetcher, createIdempotencyKey: () => 'generated-key' })

    await client.approve({
      planId,
      option_id: 'option-1',
      expected_schedule_version: 4,
      acknowledged_condition_ids: ['condition-1'],
      idempotencyKey: 'approve-key',
    })
    await client.reject({ planId, reason: 'Impact is too high', category: 'unacceptable impact', replan: true, idempotencyKey: 'reject-key' })
    await client.reply({ planId, context: 'Keep the test bay reserved.', idempotencyKey: 'reply-key' })

    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      `/api/v1/plans/${planId}/approve`,
      `/api/v1/plans/${planId}/reject`,
      `/api/v1/plans/${planId}/reply`,
    ])
    expect(JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      option_id: 'option-1',
      expected_schedule_version: 4,
      acknowledged_condition_ids: ['condition-1'],
    })
    expect(JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      reason: 'Impact is too high',
      category: 'unacceptable impact',
      replan: true,
    })
    expect(JSON.parse(String((fetcher.mock.calls[2]?.[1] as RequestInit).body))).toEqual({
      context: 'Keep the test bay reserved.',
    })
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'approve-key' })
    expect((fetcher.mock.calls[1]?.[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'reject-key' })
    expect((fetcher.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'reply-key' })
  })

  it('requires every condition supplied by the review state before approving', async () => {
    const fetcher = vi.fn()
    const client = createPlanMutationClient({ fetcher })

    await expect(client.approve({
      planId,
      option_id: 'option-1',
      expected_schedule_version: 4,
      required_condition_ids: ['condition-1', 'condition-2'],
      acknowledged_condition_ids: ['condition-1'],
    })).rejects.toMatchObject({ code: 'conditions_not_acknowledged', status: 422 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('single-flights duplicate clicks and reuses one generated idempotency key', async () => {
    let resolveRequest: (response: Response) => void = () => undefined
    const responsePromise = new Promise<Response>((resolve) => { resolveRequest = resolve })
    const fetcher = vi.fn().mockReturnValue(responsePromise)
    const client = createPlanMutationClient({ fetcher, createIdempotencyKey: () => 'single-flight-key' })
    const input = { planId, option_id: 'option-1', expected_schedule_version: 4 }

    const first = client.approve(input)
    const second = client.approve(input)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ 'Idempotency-Key': 'single-flight-key' })

    resolveRequest(new Response(JSON.stringify(approvalResponse), { status: 200 }))
    await expect(first).resolves.toEqual(approvalResponse)
    await expect(second).resolves.toEqual(approvalResponse)
  })

  it('parses 409 schedule-version metadata without offering a force apply path', () => {
    const error = parsePlanMutationError(409, {
      error: {
        code: 'schedule_version_conflict',
        message: 'The schedule changed after this plan was created.',
        request_id: 'request-1',
        retryable: false,
        details: { expected_version: 4, current_version: 6, changed_object_ids: ['A-12', 'D-07'] },
      },
    }, 'approve')

    expect(error).toBeInstanceOf(PlanMutationError)
    expect(error).toMatchObject({
      status: 409,
      code: 'schedule_version_conflict',
      requestId: 'request-1',
      isScheduleVersionConflict: true,
      scheduleVersionConflict: { expectedVersion: 4, currentVersion: 6, changedObjectIds: ['A-12', 'D-07'] },
    })
    expect('forceApply' in error).toBe(false)
  })

  it('invalidates the documented operational domains and the plan detail', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)
    await invalidatePlanMutationQueries({ invalidateQueries } as never, { planId })

    expect(invalidateQueries).toHaveBeenCalledTimes(7)
    expect(invalidateQueries.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ['schedule'],
      ['readiness'],
      ['events'],
      ['decisions'],
      ['alerts'],
      ['jobs'],
      ['plans', planId],
    ])
  })

  it('extracts changed-object IDs for one-time post-approval highlighting', () => {
    expect(changedObjectIdsFromResponse(approvalResponse)).toEqual(['A-12'])
  })
})
