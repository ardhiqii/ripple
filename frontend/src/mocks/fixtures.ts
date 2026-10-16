import type { components } from '@/api/generated/openapi'

type ScheduleResponse = components['schemas']['ScheduleResponse']
type ReadinessListResponse = components['schemas']['ReadinessListResponse']
type ReadinessDetailResponse = components['schemas']['ReadinessDetailResponse']
type EventListResponse = components['schemas']['EventListResponse']
type PolicyLeversResponse = components['schemas']['PolicyLeversResponse']
type PolicyProfilesResponse = components['schemas']['PolicyProfilesResponse']
type PolicyDataHealthResponse = components['schemas']['PolicyDataHealthResponse']

const timestamp = '2026-09-29T08:00:00Z'

export const scheduleFixture = {
  scenario_id: 'A-12-base',
  from_day: 0,
  to_day: 14,
  version: 1,
  jobs: [
    {
      id: 'A-12',
      site: 'North Delta',
      job_type: 'ESP changeout',
      start_day: 5,
      duration_days: 5,
      shortfall_bopd: 120,
      locked: false,
      lock_reason: null,
      status: 'planned',
      row_version: 1,
    },
    {
      id: 'D-07',
      site: 'West Alpha',
      job_type: 'Cargo transfer',
      start_day: 7,
      duration_days: 3,
      shortfall_bopd: 45,
      locked: false,
      lock_reason: null,
      status: 'planned',
      row_version: 1,
    },
  ],
  resources: [
    {
      id: 'barge-01',
      type: 'barge',
      name: 'CAKRA ONE',
      capacity: 100,
      unit: 'deck_units',
      active: true,
      metadata: { location: 'North Delta' },
    },
  ],
  bookings: [
    {
      id: 'booking-a12',
      resource_id: 'barge-01',
      start_day: 5,
      end_day: 10,
      load: 60,
      status: 'planned',
      job_id: 'A-12',
      cargo_id: 'cargo-a12',
      row_version: 1,
    },
  ],
  unavailability: [],
  weather: [
    {
      location: 'North Delta',
      day: 5,
      metric: 'wave_height_m',
      value: 1.2,
      go: true,
      source: 'synthetic-forecast',
    },
  ],
  capacity: [
    {
      resource_id: 'barge-01',
      unit: 'deck_units',
      feasible: true,
      max_overflow: 0,
      points: [
        {
          resource_id: 'barge-01',
          day: 5,
          used: 60,
          capacity: 100,
          overflow: 0,
          utilization_percent: 60,
          booking_ids: ['booking-a12'],
        },
      ],
    },
  ],
} satisfies ScheduleResponse

export const readinessFixture = {
  scenario_id: 'A-12-base',
  schedule_version: 1,
  items: [
    {
      id: 'ready-a12-test',
      job_id: 'A-12',
      stage: 'test-bay',
      step_order: 1,
      lead_time_days: 2,
      planned_day: 3,
      eta_earliest: 2,
      eta_latest: 4,
      confidence: 'medium',
      status: 'pending',
      source_type: 'vendor_update',
      source_reference: 'synthetic-vendor-update-01',
      last_updated: timestamp,
      not_before_day: 2,
      risk_buffer_days: 1,
      row_version: 1,
      required_by: 5,
      effective_eta: 4,
      slack: 1,
      effective_slack: 0,
      stale: false,
      freshness_hours: 4,
      feasible_for_target: true,
      earliest_feasible_start: 5,
      plan_on_latest: false,
      vendor_expedite_required: false,
      notes: ['Synthetic fixture item for A-12.'],
    },
    {
      id: 'D-07-function-test',
      job_id: 'D-07',
      stage: 'function-test',
      step_order: 1,
      lead_time_days: 2,
      planned_day: 7,
      eta_earliest: 9,
      eta_latest: 10,
      confidence: 'low',
      status: 'pending',
      source_type: 'vendor_update',
      source_reference: 'vendor email 9 Oct',
      last_updated: '2026-10-09T08:00:00Z',
      not_before_day: 9,
      risk_buffer_days: 1,
      row_version: 1,
      required_by: 10,
      effective_eta: 10,
      slack: 0,
      effective_slack: 0,
      stale: true,
      freshness_hours: 96,
      feasible_for_target: false,
      earliest_feasible_start: 11,
      plan_on_latest: true,
      vendor_expedite_required: false,
      notes: ['Vendor ETA is a D+9 to D+10 range.', 'Seal finding requires review before the test.'],
    },
  ],
  summary: { total: 2, at_risk: 2, stale: 1, low_confidence: 2, blocked: 0 },
  total_count: 2,
} satisfies ReadinessListResponse

export const readinessDetailFixture = {
  scenario_id: 'A-12-base',
  schedule_version: 1,
  item: readinessFixture.items[0],
  source: {
    source_type: 'vendor_update',
    source_reference: 'synthetic-vendor-update-01',
    last_updated: timestamp,
    confidence: 'medium',
    stale: false,
    freshness_hours: 4,
  },
  suggestion: {
    id: '00000000-0000-0000-0000-000000000051',
    event_id: '00000000-0000-0000-0000-000000000012',
    readiness_item_id: 'ready-a12-test',
    proposed_patch: { planned_day: 4, eta_latest: 4 },
    source_excerpt: 'Synthetic vendor update: test result expected by D+2.',
    confidence: 0.82,
    base_row_version: 1,
    state: 'proposed',
    review_actor: null,
    review_note: null,
    created_at: timestamp,
    reviewed_at: null,
  },
  history: [],
} satisfies ReadinessDetailResponse

export const eventsFixture = {
  events: [
    {
      id: '00000000-0000-0000-0000-000000000012',
      nature: 'disruption',
      cause: 'Vendor ETA moved to day 6.',
      state: 'extracted',
      extraction_version: 1,
      raw_text_preview: 'Synthetic vendor update for A-12.',
      created_at: timestamp,
      updated_at: timestamp,
      job_ids: ['A-12'],
      latest_run_id: null,
      latest_run_state: null,
      latest_plan_id: null,
      latest_plan_status: null,
    },
  ],
  next_cursor: null,
  total_count: 1,
  scenario_lifecycle_counts: {
    draft: 0,
    reading_input: 0,
    needs_clarification: 0,
    ready_to_investigate: 1,
    investigating: 0,
    options_ready: 0,
    stale: 0,
    approved: 0,
    rejected: 0,
    superseded: 0,
    failed: 0,
    integrity_error: 0,
  },
} satisfies EventListResponse

export const policyLeversFixture = {
  levers: [
    { name: 'expedite', allowed: true, approval: 'planner', cost_weight: 2 },
    { name: 'move_job', allowed: true, approval: 'planner', cost_weight: 1 },
    { name: 'cancel_job', allowed: false, approval: 'never', cost_weight: 100 },
  ],
} satisfies PolicyLeversResponse

export const policyProfilesFixture = {
  default_profile: 'balanced',
  profiles: [
    {
      name: 'balanced',
      delay_weight: 1,
      lever_cost_weight: 1,
      movement_weight: 1,
      risk_weight: 1,
    },
  ],
} satisfies PolicyProfilesResponse

export const policyDataHealthFixture = {
  as_of: timestamp,
  stale_after_hours: 48,
  sources: [
    {
      source_type: 'vendor_update',
      item_count: 1,
      latest_updated_at: timestamp,
      stale_count: 0,
      status: 'healthy',
    },
  ],
} satisfies PolicyDataHealthResponse

export const apiErrorFixture = (code: string, message: string) => ({
  error: {
    code,
    message,
    request_id: '00000000-0000-0000-0000-000000000099',
    retryable: code === 'internal_error',
    details: {},
  },
})
