export type ReadinessStatus = 'pending' | 'ready' | 'blocked' | 'waived'
export type ReadinessConfidence = 'low' | 'medium' | 'high'

// Kept only for the existing integration fixture test; production routes use
// the API adapter and never initialize this compatibility export.
export { readinessTestRows as initialReadinessRows } from './readiness-test-fixtures'

export interface ReadinessRow {
  id: string
  job_id: string
  stage: string
  step_order: number
  lead_time_days: number
  planned_day: number | null
  eta_earliest: number | null
  eta_latest: number | null
  confidence: ReadinessConfidence
  status: ReadinessStatus
  source_type: string
  source_reference: string | null
  last_updated: string | null
  required_by: number
  effective_eta: number | null
  slack: number | null
  effective_slack: number | null
  stale: boolean
  freshness_hours: number | null
  feasible_for_target: boolean
  vendor_expedite_required: boolean
  notes: string[]
  row_version: number
}

export type ReadinessUpdate = (itemId: string, status: ReadinessStatus, expectedRowVersion?: number) => Promise<ReadinessRow | void>

export function riskForRow(row: ReadinessRow): 'critical' | 'due' | 'on_track' {
  if (row.status === 'blocked' || (row.effective_slack ?? row.slack ?? 99) <= 0) return 'critical'
  if ((row.effective_slack ?? row.slack ?? 99) <= 2) return 'due'
  return 'on_track'
}

export function filterReadinessRows(
  rows: ReadinessRow[],
  filters: {
    risk?: string
    job?: string
    stage?: string
    confidence?: string
    freshness?: string
    q?: string
  },
) {
  const query = filters.q?.trim().toLowerCase()
  return rows.filter((row) => {
    const matchesRisk = !filters.risk || filters.risk === 'all' || riskForRow(row) === filters.risk
    const matchesJob = !filters.job || row.job_id === filters.job
    const matchesStage = !filters.stage || row.stage === filters.stage
    const matchesConfidence = !filters.confidence || row.confidence === filters.confidence
    const matchesFreshness = !filters.freshness
      || (filters.freshness === 'stale' && row.stale)
      || (filters.freshness === 'fresh' && !row.stale)
    const haystack = `${row.id} ${row.job_id} ${row.stage} ${row.source_type} ${row.source_reference ?? ''}`.toLowerCase()
    return matchesRisk && matchesJob && matchesStage && matchesConfidence && matchesFreshness && (!query || haystack.includes(query))
  })
}
