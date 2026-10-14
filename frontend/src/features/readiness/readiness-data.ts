import { readinessFixture } from '@/mocks/fixtures'

export type ReadinessStatus = 'pending' | 'ready' | 'blocked' | 'waived'
export type ReadinessConfidence = 'low' | 'medium' | 'high'

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
  notes: string[]
}

export const initialReadinessRows: ReadinessRow[] = readinessFixture.items.map((item) => ({
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
  notes: [...item.notes],
}))

export type ReadinessUpdate = (itemId: string, status: ReadinessStatus) => Promise<void>

export const mockUpdateReadinessStatus: ReadinessUpdate = async () => undefined

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
    const haystack = `${row.id} ${row.job_id} ${row.stage} ${row.source_reference ?? ''}`.toLowerCase()
    return matchesRisk && matchesJob && matchesStage && matchesConfidence && matchesFreshness && (!query || haystack.includes(query))
  })
}
