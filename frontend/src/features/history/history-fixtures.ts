import type { components } from '@/api/generated/openapi'

import { createHistoryViewData, type HistoryRecordContext } from './history-data'

type DecisionDetailResponse = components['schemas']['DecisionDetailResponse']
type DecisionListResponse = components['schemas']['DecisionListResponse']
type DecisionSummaryResponse = components['schemas']['DecisionSummaryResponse']

const approvedId = '00000000-0000-0000-0000-000000000401'
const rejectedId = '00000000-0000-0000-0000-000000000402'
const replyId = '00000000-0000-0000-0000-000000000403'

const historyDecisions: DecisionSummaryResponse[] = [
  {
    id: approvedId,
    plan_id: '00000000-0000-0000-0000-000000000201',
    event_id: '00000000-0000-0000-0000-000000000012',
    event_nature: 'disruption',
    event_cause: 'Vendor ETA moved after a seal finding.',
    context_status: 'captured',
    job_ids: ['A-12'],
    plan_version: 3,
    selected_option_id: 'option-a12-1',
    action: 'approve',
    actor: 'planner.demo',
    reason: 'Move A-12 after the vendor confirmation.',
    category: 'operational_change',
    acknowledged_condition_ids: ['test-bay-ready'],
    schedule_version_before: 12,
    schedule_version_after: 13,
    created_at: '2026-09-29T10:30:00Z',
  },
  {
    id: rejectedId,
    plan_id: '00000000-0000-0000-0000-000000000202',
    event_id: '00000000-0000-0000-0000-000000000013',
    event_nature: 'disruption',
    event_cause: 'D-07 vendor delay and seal finding.',
    context_status: 'captured',
    job_ids: ['D-07'],
    plan_version: 1,
    selected_option_id: null,
    action: 'reject',
    actor: 'planner.demo',
    reason: 'The test bay constraint is not confirmed.',
    category: 'constraint',
    acknowledged_condition_ids: [],
    schedule_version_before: 13,
    schedule_version_after: null,
    created_at: '2026-09-29T12:00:00Z',
  },
  {
    id: replyId,
    plan_id: '00000000-0000-0000-0000-000000000204',
    event_id: '00000000-0000-0000-0000-000000000015',
    event_nature: 'disruption',
    event_cause: 'Planner requested a replan around the seal risk.',
    context_status: 'captured',
    job_ids: ['D-07'],
    plan_version: 2,
    selected_option_id: null,
    action: 'reply',
    actor: 'planner.ops',
    reason: 'Keep E-02 unchanged; replan D-07 around the seal risk.',
    category: 'new_context',
    acknowledged_condition_ids: [],
    schedule_version_before: 13,
    schedule_version_after: null,
    created_at: '2026-09-30T08:15:00Z',
  },
]

export const historyListFixture = {
  decisions: historyDecisions,
  next_cursor: null,
  total_count: 3,
} satisfies DecisionListResponse

const contextById: Record<string, HistoryRecordContext> = {
  [approvedId]: {
    eventId: '00000000-0000-0000-0000-000000000012',
    eventNature: 'disruption',
    jobs: ['A-12'],
    levers: ['move_job'],
    summary: 'A-12 vendor ETA moved to D+6',
    planVersion: 3,
    runId: 'run-a12-approve',
    sourceReceivedAt: '2026-09-29T08:00:00Z',
    extractionAt: '2026-09-29T08:05:00Z',
    agentRunAt: '2026-09-29T08:10:00Z',
    planProposedAt: '2026-09-29T08:20:00Z',
    approvalRevalidatedAt: '2026-09-29T10:29:00Z',
    appliedAt: '2026-09-29T10:30:00Z',
    notificationDrafts: ['notification-1'],
  },
  [rejectedId]: {
    eventId: '00000000-0000-0000-0000-000000000013',
    eventNature: 'disruption',
    jobs: ['D-07'],
    summary: 'D-07 vendor delay and seal finding',
    planVersion: 1,
    sourceReceivedAt: '2026-09-29T11:00:00Z',
    extractionAt: '2026-09-29T11:05:00Z',
    agentRunAt: '2026-09-29T11:10:00Z',
    planProposedAt: '2026-09-29T11:20:00Z',
  },
  [replyId]: {
    eventId: '00000000-0000-0000-0000-000000000015',
    eventNature: 'disruption',
    jobs: ['D-07'],
    summary: 'D-07 replan after planner reply',
    planVersion: 2,
    sourceReceivedAt: '2026-09-30T07:45:00Z',
    extractionAt: '2026-09-30T07:50:00Z',
    agentRunAt: '2026-09-30T08:00:00Z',
    planProposedAt: '2026-09-30T08:10:00Z',
  },
}

export const historyDetailFixtures = {
  [approvedId]: {
    ...historyListFixture.decisions[0],
    event_id: '00000000-0000-0000-0000-000000000012',
    event_nature: 'disruption',
    job_ids: ['A-12'],
    plan_version: 3,
    changes: [
      {
        decision_id: approvedId,
        entity_type: 'job',
        entity_id: 'A-12',
        field: 'start_day',
        change_kind: 'moved',
        before: { start_day: 5 },
        after: { start_day: 7 },
      },
    ],
  },
  [rejectedId]: {
    ...historyListFixture.decisions[1],
    event_id: '00000000-0000-0000-0000-000000000013',
    event_nature: 'disruption',
    job_ids: ['D-07'],
    plan_version: 1,
    changes: [],
  },
  [replyId]: {
    ...historyListFixture.decisions[2],
    event_id: '00000000-0000-0000-0000-000000000015',
    event_nature: 'disruption',
    job_ids: ['D-07'],
    plan_version: 2,
    changes: [],
  },
} satisfies Record<string, DecisionDetailResponse>

export const historyFixture = createHistoryViewData(historyListFixture, historyDetailFixtures, contextById)

export const historyFixtureIds = {
  approved: approvedId,
  rejected: rejectedId,
  reply: replyId,
} as const
