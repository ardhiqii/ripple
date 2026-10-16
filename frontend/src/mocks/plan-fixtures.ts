import type { components } from '@/api/generated/openapi'

type PlanDetailResponse = components['schemas']['PlanDetailResponse']
type PublicRunEventResponse = components['schemas']['PublicRunEventResponse']

export const a12PlanFixture = {
  id: '00000000-0000-0000-0000-000000000201',
  event_id: '00000000-0000-0000-0000-000000000012',
  run_id: '00000000-0000-0000-0000-000000000101',
  version: 1,
  verdict: 'conditional',
  recommended_option_id: '00000000-0000-0000-0000-000000000211',
  base_schedule_version: 1,
  explanation: {
    planner: 'Move A-12 to D+5 after test readiness clears.',
    management: 'The recommendation is conditional on the D+2 test.',
    logistics: 'Cargo move for D-07 is required before the barge window.',
    numeric_check: { status: 'passed' },
  },
  counterfactual: {
    status: 'feasible',
    job_id: 'A-12',
    target_start: 3,
    levers: ['expedite'],
  },
  status: 'proposed',
  created_at: '2026-10-13T12:00:04Z',
  options: [
    {
      id: '00000000-0000-0000-0000-000000000211',
      plan_id: '00000000-0000-0000-0000-000000000201',
      label: 'Move A-12 to D+5 with cargo coordination',
      weight_profile: { name: 'balanced' },
      solver_status: 'feasible',
      objective_value: '12.5',
      solve_milliseconds: 118,
      changes: [
        { kind: 'move_job', target: 'A-12', value: 5 },
        { kind: 'move_cargo', target: 'D-07-drums', value: 6 },
      ],
      conditions: [
        {
          id: 'condition-a12-test',
          text: 'Test bay result is available by D+2.',
          source: 'readiness',
          approver: 'planner',
          outside_model: true,
        },
      ],
      kpi: { jobs_moved: 1, total_delay_days: 0, shortfall_bopd_days: 0 },
      violations: [],
      rank: 1,
      is_recommended: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000212',
      plan_id: '00000000-0000-0000-0000-000000000201',
      label: 'Hold A-12 until D+7',
      weight_profile: { name: 'balanced' },
      solver_status: 'feasible',
      objective_value: '18',
      solve_milliseconds: 104,
      changes: [{ kind: 'move_job', target: 'A-12', value: 7 }],
      conditions: [],
      kpi: { jobs_moved: 1, total_delay_days: 2, shortfall_bopd_days: 240 },
      violations: [],
      rank: 2,
      is_recommended: false,
    },
    {
      id: '00000000-0000-0000-0000-000000000213',
      plan_id: '00000000-0000-0000-0000-000000000201',
      label: 'Start A-12 at D+3',
      weight_profile: { name: 'balanced' },
      solver_status: 'infeasible',
      objective_value: null,
      solve_milliseconds: 97,
      changes: [{ kind: 'move_job', target: 'A-12', value: 3 }],
      conditions: [],
      kpi: {},
      violations: [{ code: 'readiness_blocked', summary: 'Test bay is not ready.' }],
      rank: 3,
      is_recommended: false,
    },
  ],
  evidence: [
    {
      plan_id: '00000000-0000-0000-0000-000000000201',
      claim_id: 'readiness',
      claim_text: 'A-12 readiness was checked.',
      tool_call_id: '00000000-0000-0000-0000-000000000301',
      evidence_type: 'tool_result',
    },
  ],
  lineage: [
    {
      id: '00000000-0000-0000-0000-000000000201',
      event_id: '00000000-0000-0000-0000-000000000012',
      run_id: '00000000-0000-0000-0000-000000000101',
      version: 1,
      verdict: 'conditional',
      status: 'proposed',
      supersedes_plan_id: null,
      created_at: '2026-10-13T12:00:04Z',
    },
  ],
} satisfies PlanDetailResponse

export const infeasiblePlanFixture = {
  ...a12PlanFixture,
  id: '00000000-0000-0000-0000-000000000202',
  verdict: 'infeasible',
  recommended_option_id: null,
  status: 'proposed',
  options: [a12PlanFixture.options[2]],
} satisfies PlanDetailResponse

export const numericFallbackPlanFixture = {
  ...a12PlanFixture,
  id: '00000000-0000-0000-0000-000000000203',
  explanation: {
    planner: 'The engine returned a verified schedule result.',
    management: 'Verified status: conditional.',
    logistics: 'The explanation used the deterministic fallback.',
    numeric_check: { status: 'fallback', mismatches: [] },
  },
} satisfies PlanDetailResponse

export const recordedRunEvents = [
  {
    run_id: '00000000-0000-0000-0000-000000000101',
    seq: 1,
    type: 'run_started',
    timestamp: '2026-10-13T12:00:00Z',
    phase: 'intake',
    public: { summary: 'Recorded A-12 run started.' },
  },
  {
    run_id: '00000000-0000-0000-0000-000000000101',
    seq: 2,
    type: 'tool_result',
    timestamp: '2026-10-13T12:00:01Z',
    phase: 'investigation',
    public: { tool: 'check_readiness', summary: 'Readiness checks completed.' },
  },
  {
    run_id: '00000000-0000-0000-0000-000000000101',
    seq: 3,
    type: 'plan',
    timestamp: '2026-10-13T12:00:02Z',
    phase: 'complete',
    public: { summary: 'Verified plan options are ready for review.', option_count: 3 },
  },
  {
    run_id: '00000000-0000-0000-0000-000000000101',
    seq: 4,
    type: 'done',
    timestamp: '2026-10-13T12:00:03Z',
    phase: 'complete',
    public: { status: 'completed', summary: 'Recorded A-12 run completed.' },
  },
] satisfies PublicRunEventResponse[]

export function recordedEventsAfter(sequence: number): PublicRunEventResponse[] {
  return recordedRunEvents.filter((event) => event.seq > sequence)
}
