import { http, HttpResponse } from 'msw'

import type { components } from '@/api/generated/openapi'

import {
  apiErrorFixture,
  eventsFixture,
  policyDataHealthFixture,
  policyLeversFixture,
  policyProfilesFixture,
  readinessDetailFixture,
  readinessFixture,
  scheduleFixture,
} from './fixtures'
import {
  a12PlanFixture,
  infeasiblePlanFixture,
  numericFallbackPlanFixture,
  recordedEventsAfter,
} from './plan-fixtures'

type Schemas = components['schemas']

const a12EventId = '00000000-0000-0000-0000-000000000012'
const a12RunId = '00000000-0000-0000-0000-000000000101'
const a12PlanId = '00000000-0000-0000-0000-000000000201'
const a12ApprovalDecisionId = '00000000-0000-0000-0000-000000000401'
const a12RejectDecisionId = '00000000-0000-0000-0000-000000000402'
const a12ReplyDecisionId = '00000000-0000-0000-0000-000000000403'
const a12NotificationDraftId = '00000000-0000-0000-0000-000000000501'
const a12Message = "A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it."
const a12Timestamp = '2026-10-13T12:00:00Z'

const a12EventResponse = {
  id: a12EventId,
  scenario_id: 'A-12-base',
  nature: 'request',
  cause: 'A-12 output dropped.',
  raw_text: a12Message,
  state: 'received',
  origin_type: 'manual',
  extraction_version: 0,
  created_by: 'demo-planner',
  created_at: a12Timestamp,
  updated_at: a12Timestamp,
} satisfies Schemas['EventResponse']

const a12Correction = {
  source_excerpt: a12Message,
  nature: 'request',
  cause: 'A-12 output dropped.',
  job_ids: ['A-12'],
  requested_start: 3,
  objective: 'recover production',
  hard_constraints: [
    {
      kind: 'fixed_job',
      source_excerpt: "Don't touch B-05, the client is inspecting it.",
      value: 'B-05',
    },
  ],
  soft_preferences: ['minimize delay for A-12'],
  eta_updates: [],
  risk_tags: [],
  levers_ruled_out: [],
  missing_info: [],
} satisfies Schemas['ChangeEventExtraction']

const a12CorrectedEventResponse = {
  ...a12EventResponse,
  state: 'extracted',
  extraction_version: 1,
  updated_at: '2026-10-13T12:00:02Z',
} satisfies Schemas['EventResponse']

const a12EventDetailResponse = {
  event: a12CorrectedEventResponse,
  extractions: [
    {
      event_id: a12EventId,
      version: 1,
      extracted_json: a12Correction,
      model_name: 'planner-correction',
      prompt_version: 'manual-v1',
      confidence_summary: { source: 'planner' },
      corrected: true,
      correction_actor: 'demo-planner',
      corrected_at: '2026-10-13T12:00:02Z',
      created_at: '2026-10-13T12:00:02Z',
    },
  ],
  runs: [
    {
      id: a12RunId,
      state: 'completed',
      attempt: 1,
      extraction_version: 1,
      started_at: '2026-10-13T12:00:03Z',
      completed_at: '2026-10-13T12:00:04Z',
    },
  ],
  plans: [
    {
      id: a12PlanId,
      version: 1,
      verdict: 'conditional',
      status: 'proposed',
      base_schedule_version: 1,
      created_at: '2026-10-13T12:00:04Z',
    },
  ],
} satisfies Schemas['EventDetailResponse']

const a12RunCreateResponse = {
  run_id: a12RunId,
  event_id: a12EventId,
  extraction_version: 1,
  state: 'queued',
  attempt: 1,
  stream_url: `/api/v1/runs/${a12RunId}/stream`,
} satisfies Schemas['RunCreateResponse']

const a12ExtractionStartResponse = {
  event_id: a12EventId,
  state: 'planning',
  extraction_version: 0,
  status: 'queued',
} satisfies Schemas['ExtractionStartResponse']

const a12ApprovalResponse = {
  decision_id: a12ApprovalDecisionId,
  plan_id: a12PlanId,
  schedule_version_before: 1,
  schedule_version_after: 2,
  changed_objects: [
    {
      entity_type: 'job',
      entity_id: 'A-12',
      change_kind: 'updated',
      before: { start_day: 9 },
      after: { start_day: 5 },
    },
    {
      entity_type: 'booking',
      entity_id: 'cargo-D-07-drums',
      change_kind: 'updated',
      before: { resource_id: 'SB-1', start_day: 5, end_day: 5 },
      after: { resource_id: 'SB-1', start_day: 6, end_day: 6 },
    },
  ],
  notification_draft_ids: [a12NotificationDraftId],
} satisfies Schemas['ApprovalResponse']

const a12DecisionResponse = (action: 'reject' | 'reply', decisionId: string) => ({
  decision_id: decisionId,
  plan_id: a12PlanId,
  action,
  replan_requested: action === 'reject',
  event_id: a12EventId,
}) satisfies Schemas['DecisionMutationResponse']

const scenario = (request: Request) => new URL(request.url).searchParams.get('scenario')

const planFixture = (planId: string) => {
  if (planId.endsWith('202')) return infeasiblePlanFixture
  if (planId.endsWith('203')) return numericFallbackPlanFixture
  return a12PlanFixture
}

const streamSequence = (request: Request) => {
  const url = new URL(request.url)
  const fromQuery = Number(url.searchParams.get('after') ?? 0)
  const fromHeader = Number(request.headers.get('Last-Event-ID') ?? 0)
  return Math.max(Number.isFinite(fromQuery) ? fromQuery : 0, Number.isFinite(fromHeader) ? fromHeader : 0)
}

const sse = (runId: string, sequence: number) => recordedEventsAfter(sequence)
  .map((event) => {
    const envelope = JSON.stringify({ ...event, run_id: runId })
    return `id: ${event.seq}\nevent: ${event.type}\ndata: ${envelope}\n\n`
  })
  .join('')

export const handlers = [
  http.get('*/api/v1/schedule', () => HttpResponse.json(scheduleFixture)),
  http.get('*/api/v1/readiness', () => HttpResponse.json(readinessFixture)),
  http.get('*/api/v1/events', ({ request }) => {
    if (scenario(request) === 'offline') return HttpResponse.error()
    return HttpResponse.json(eventsFixture)
  }),
  http.get('*/api/v1/policy/levers', () => HttpResponse.json(policyLeversFixture)),
  http.get('*/api/v1/policy/profiles', () => HttpResponse.json(policyProfilesFixture)),
  http.get('*/api/v1/policy/data-health', ({ request }) => {
    if (scenario(request) === 'server-error') {
      return HttpResponse.json(apiErrorFixture('internal_error', 'Fixture server error.'), {
        status: 500,
      })
    }
    return HttpResponse.json(policyDataHealthFixture)
  }),
  http.patch('*/api/v1/readiness/:itemId', ({ request }) => {
    if (scenario(request) === 'version-conflict') {
      return HttpResponse.json(
        apiErrorFixture('version_conflict', 'The readiness item changed.'),
        { status: 409 },
      )
    }
    return HttpResponse.json({ item: readinessFixture.items[0], schedule_version: 1 })
  }),
  http.get('*/api/v1/readiness/:itemId', () => HttpResponse.json(readinessDetailFixture)),
  http.post('*/api/v1/events', ({ request }) => {
    if (scenario(request) === 'validation-error') {
      return HttpResponse.json(
        apiErrorFixture('validation_error', 'Paste a change update.'),
        { status: 422 },
      )
    }
    return HttpResponse.json(
      a12EventResponse,
      { status: 201 },
    )
  }),
  http.post('*/api/v1/events/:eventId/extract', ({ params }) => {
    return HttpResponse.json({
      ...a12ExtractionStartResponse,
      event_id: String(params.eventId),
    })
  }),
  http.patch('*/api/v1/events/:eventId/extraction', () => {
    return HttpResponse.json(a12EventDetailResponse)
  }),
  http.post('*/api/v1/events/:eventId/runs', () => {
    return HttpResponse.json(a12RunCreateResponse, { status: 201 })
  }),
  http.get('*/api/v1/events/:eventId', () => HttpResponse.json(a12EventDetailResponse)),
  http.get('*/api/v1/plans/:planId', ({ params }) => {
    return HttpResponse.json(planFixture(String(params.planId)))
  }),
  http.get('*/api/v1/runs/:runId/stream', ({ params, request }) => {
    const runId = String(params.runId)
    return new HttpResponse(sse(runId, streamSequence(request)), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }),
  http.post('*/api/v1/plans/:planId/approve', ({ request }) => {
    if (scenario(request) === 'version-conflict') {
      return HttpResponse.json(
        apiErrorFixture('version_conflict', 'Schedule changed since this plan was created.'),
        { status: 409 },
      )
    }
    return HttpResponse.json(a12ApprovalResponse)
  }),
  http.post('*/api/v1/plans/:planId/reject', () => {
    return HttpResponse.json(a12DecisionResponse('reject', a12RejectDecisionId))
  }),
  http.post('*/api/v1/plans/:planId/reply', () => {
    return HttpResponse.json(a12DecisionResponse('reply', a12ReplyDecisionId))
  }),
]
