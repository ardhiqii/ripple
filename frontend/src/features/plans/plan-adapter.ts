export type PlanChange = { kind: string; target: string; value: number | string }

export type PlanCondition = {
  id: string
  text: string
  source: string
  approver: string
  outsideModel: boolean
}

export type PlanOptionView = {
  id: string
  planId: string
  label: string
  solverStatus: string
  objectiveValue: number | null
  isRecommended: boolean
  changes: PlanChange[]
  conditions: PlanCondition[]
  kpi: Record<string, unknown>
  violations: Array<{ code: string; summary: string }>
  rank: number
}

export type PlanEvidenceView = {
  claimId: string
  claimText: string
  toolCallId: string
  evidenceType: string
}

export type PlanLineageView = {
  id: string
  eventId: string
  runId: string
  version: number
  verdict: string
  status: string
  supersedesPlanId: string | null
  createdAt: string
}

export interface PlanWorkspaceData {
  id: string
  eventId: string
  runId: string
  version: number
  verdict: string
  recommendedOptionId: string | null
  baseScheduleVersion: number
  status: string
  explanation: Record<string, unknown>
  options: PlanOptionView[]
  evidence: PlanEvidenceView[]
  lineage: PlanLineageView[]
  currentScheduleVersion?: number
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function asString(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback }
function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}
function asNullableNumber(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const parsed = asNumber(value, Number.NaN); return Number.isFinite(parsed) ? parsed : null }
function asNumberOrString(value: unknown): number | string { return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? value : '' }
function asBoolean(value: unknown, fallback = false): boolean { return typeof value === 'boolean' ? value : fallback }

function mapChange(value: unknown): PlanChange {
  const change = asRecord(value)
  return { kind: asString(change.kind), target: asString(change.target), value: asNumberOrString(change.value) }
}

function mapCondition(value: unknown): PlanCondition {
  const condition = asRecord(value)
  return { id: asString(condition.id), text: asString(condition.text), source: asString(condition.source), approver: asString(condition.approver), outsideModel: asBoolean(condition.outside_model) }
}

function mapViolation(value: unknown): { code: string; summary: string } {
  const violation = asRecord(value)
  return { code: asString(violation.code), summary: asString(violation.summary) }
}

function mapOption(value: unknown, workspaceId: string): PlanOptionView {
  const option = asRecord(value)
  return {
    id: asString(option.id),
    planId: asString(option.plan_id, workspaceId),
    label: asString(option.label),
    solverStatus: asString(option.solver_status),
    objectiveValue: asNullableNumber(option.objective_value),
    isRecommended: asBoolean(option.is_recommended),
    changes: asArray(option.changes).map(mapChange),
    conditions: asArray(option.conditions).map(mapCondition),
    kpi: asRecord(option.kpi),
    violations: asArray(option.violations).map(mapViolation),
    rank: asNumber(option.rank),
  }
}

function mapEvidence(value: unknown): PlanEvidenceView {
  const evidence = asRecord(value)
  return { claimId: asString(evidence.claim_id), claimText: asString(evidence.claim_text), toolCallId: asString(evidence.tool_call_id), evidenceType: asString(evidence.evidence_type) }
}

function mapLineage(value: unknown): PlanLineageView {
  const lineage = asRecord(value)
  return { id: asString(lineage.id), eventId: asString(lineage.event_id), runId: asString(lineage.run_id), version: asNumber(lineage.version), verdict: asString(lineage.verdict), status: asString(lineage.status), supersedesPlanId: typeof lineage.supersedes_plan_id === 'string' ? lineage.supersedes_plan_id : null, createdAt: asString(lineage.created_at) }
}

export function adaptPlanDetail(value: PlanDetailResponse): PlanWorkspaceData {
  const rawPlan = asRecord(value)
  const id = asString(rawPlan.id)
  const baseScheduleVersion = asNumber(rawPlan.base_schedule_version)
  return {
    id,
    eventId: asString(rawPlan.event_id),
    runId: asString(rawPlan.run_id),
    version: asNumber(rawPlan.version),
    verdict: asString(rawPlan.verdict),
    recommendedOptionId: typeof rawPlan.recommended_option_id === 'string' ? rawPlan.recommended_option_id : null,
    baseScheduleVersion,
    status: asString(rawPlan.status),
    explanation: asRecord(rawPlan.explanation),
    options: asArray(rawPlan.options).map((option) => mapOption(option, id)),
    evidence: asArray(rawPlan.evidence).map(mapEvidence),
    lineage: asArray(rawPlan.lineage).map(mapLineage),
    currentScheduleVersion: asNumber(rawPlan.current_schedule_version, baseScheduleVersion),
  }
}

export function findOption(data: PlanWorkspaceData, id: string): PlanOptionView | undefined { return data.options.find((option) => option.id === id) }
export function isOptionSelectable(option: PlanOptionView): boolean {
  const solverStatus = option.solverStatus.trim().toLowerCase()
  return (solverStatus === 'feasible' || solverStatus === 'optimal') && option.violations.length === 0
}
export function optionMetricValue(option: PlanOptionView, metric: string): number | string | null {
  const normalizedMetric = metric.trim().toLowerCase()
  if (normalizedMetric === 'objective' || normalizedMetric === 'objective_value') return option.objectiveValue
  if (normalizedMetric === 'solver_status') return option.solverStatus
  if (normalizedMetric === 'rank') return option.rank
  if (normalizedMetric === 'conditions') return option.conditions.length
  if (normalizedMetric === 'violations') return option.violations.length
  const value = option.kpi[metric] ?? option.kpi[normalizedMetric]
  return typeof value === 'number' || typeof value === 'string' ? value : null
}
import type { components } from '@/api/generated/openapi'

type PlanDetailResponse = components['schemas']['PlanDetailResponse']
