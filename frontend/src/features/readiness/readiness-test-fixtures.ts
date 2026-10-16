import { readinessFixture } from '@/mocks/fixtures'

import type { ReadinessConfidence, ReadinessRow, ReadinessStatus } from './readiness-data'

export const readinessTestRows: ReadinessRow[] = readinessFixture.items.map((item) => ({
  id: item.id,
  job_id: item.job_id,
  stage: item.stage,
  step_order: item.step_order,
  lead_time_days: item.lead_time_days,
  planned_day: item.planned_day,
  eta_earliest: item.eta_earliest,
  eta_latest: item.eta_latest,
  confidence: item.confidence as ReadinessConfidence,
  status: item.status as ReadinessStatus,
  source_type: item.source_type,
  source_reference: item.source_reference,
  last_updated: item.last_updated,
  required_by: item.required_by,
  effective_eta: item.effective_eta,
  slack: item.slack,
  effective_slack: item.effective_slack,
  stale: item.stale,
  freshness_hours: item.freshness_hours,
  feasible_for_target: item.feasible_for_target,
  vendor_expedite_required: item.vendor_expedite_required,
  notes: [...item.notes],
  row_version: item.row_version,
}))
