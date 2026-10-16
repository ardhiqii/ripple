import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError, apiTransport } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

import { type ReadinessConfidence, type ReadinessRow, type ReadinessStatus } from './readiness-data'

export interface ReadinessQuery {
  job?: string
  status?: string
  confidence?: string
  risk?: string
  freshness?: string
  item?: string
  q?: string
}

export interface ReadinessSummary {
  total: number
  at_risk: number
  stale: number
  low_confidence: number
  blocked: number
}

export interface ReadinessListData {
  scenarioId: string
  scheduleVersion: number
  items: ReadinessRow[]
  summary: ReadinessSummary
  totalCount: number
}

export interface ReadinessSource {
  sourceType: string
  sourceReference: string | null
  lastUpdated: string | null
  confidence: ReadinessConfidence
  stale: boolean
  freshnessHours: number | null
}

export interface ReadinessSuggestion {
  id: string
  eventId: string
  readinessItemId: string
  proposedPatch: Record<string, unknown>
  sourceExcerpt: string | null
  confidence: number | null
  baseRowVersion: number
  state: string
  reviewActor: string | null
  reviewNote: string | null
  createdAt: string | null
  reviewedAt: string | null
}

export type ReadinessHistoryEntry = ReadinessSuggestion

export interface ReadinessDetailData {
  scenarioId: string
  scheduleVersion: number
  item: ReadinessRow
  source: ReadinessSource
  suggestion: ReadinessSuggestion | null
  history: ReadinessHistoryEntry[]
}

type ReadinessListResponse = components['schemas']['ReadinessListResponse']
type ReadinessDetailResponse = components['schemas']['ReadinessDetailResponse']
type ReadinessPatchRequest = components['schemas']['ReadinessPatchRequest']
type ReadinessWriteResponse = components['schemas']['ReadinessWriteResponse']

export async function fetchReadiness(query: ReadinessQuery = {}): Promise<ReadinessListData> {
  const params = new URLSearchParams()
  if (query.job) params.set('job_id', query.job)
  if (query.status && isReadinessStatus(query.status)) params.set('status', query.status)
  if (query.confidence && isReadinessConfidence(query.confidence)) params.set('confidence', query.confidence)
  if (query.risk === 'critical' || query.risk === 'at_risk') params.set('risk', 'at_risk')
  if (query.risk === 'stale' || query.freshness === 'stale') params.set('risk', 'stale')
  if (query.item) params.set('item', query.item)
  if (query.q?.trim()) params.set('q', query.q.trim())

  const suffix = params.toString()
  try {
    const payload = await apiTransport.get<ReadinessListResponse>(`/api/v1/readiness${suffix ? `?${suffix}` : ''}`)
    return adaptReadinessList(payload)
  } catch (error) {
    throw normalizeReadinessError(error, 'Readiness queue could not be loaded.')
  }
}

export async function fetchReadinessDetail(itemId: string): Promise<ReadinessDetailData> {
  try {
    const payload = await apiTransport.get<ReadinessDetailResponse>(`/api/v1/readiness/${encodeURIComponent(itemId)}`)
    return adaptReadinessDetail(payload)
  } catch (error) {
    throw normalizeReadinessError(error, 'Readiness detail could not be loaded.')
  }
}

export async function patchReadiness(itemId: string, status: ReadinessStatus, expectedRowVersion: number): Promise<ReadinessRow> {
  try {
    const body: ReadinessPatchRequest = { status, expected_row_version: expectedRowVersion }
    const payload = await apiTransport.patch<ReadinessWriteResponse>(`/api/v1/readiness/${encodeURIComponent(itemId)}`, body)
    const row = asRecord(asRecord(payload)?.item)
    if (!row) throw new Error('Readiness write response did not include an item.')
    return adaptReadinessItem(row)
  } catch (error) {
    throw normalizeReadinessError(error, 'Readiness update could not be saved.')
  }
}

export function useReadiness(query: ReadinessQuery = {}) {
  return useQuery({
    queryKey: apiTransport.queryKey('readiness', query),
    queryFn: () => fetchReadiness(query),
  })
}

export function useReadinessDetail(itemId?: string) {
  return useQuery({
    queryKey: apiTransport.queryKey('readiness', 'detail', itemId),
    queryFn: () => fetchReadinessDetail(itemId!),
    enabled: Boolean(itemId),
  })
}

export function useUpdateReadiness() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ itemId, status, expectedRowVersion }: { itemId: string; status: ReadinessStatus; expectedRowVersion: number }) => patchReadiness(itemId, status, expectedRowVersion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('readiness') })
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: apiTransport.queryKey('readiness') })
    },
  })
}

function adaptReadinessList(payload: ReadinessListResponse): ReadinessListData {
  const root = asRecord(payload)
  const summary = asRecord(root?.summary)
  return {
    scenarioId: stringValue(root?.scenario_id) ?? '',
    scheduleVersion: numberValue(root?.schedule_version),
    items: arrayValue(root?.items).map(adaptReadinessItem),
    summary: {
      total: numberValue(summary?.total),
      at_risk: numberValue(summary?.at_risk),
      stale: numberValue(summary?.stale),
      low_confidence: numberValue(summary?.low_confidence),
      blocked: numberValue(summary?.blocked),
    },
    totalCount: numberValue(root?.total_count),
  }
}

function adaptReadinessDetail(payload: ReadinessDetailResponse): ReadinessDetailData {
  const root = asRecord(payload)
  const source = asRecord(root?.source)
  const suggestion = asRecord(root?.suggestion)
  return {
    scenarioId: stringValue(root?.scenario_id) ?? '',
    scheduleVersion: numberValue(root?.schedule_version),
    item: adaptReadinessItem(root?.item),
    source: {
      sourceType: stringValue(source?.source_type) ?? 'unknown',
      sourceReference: nullableString(source?.source_reference),
      lastUpdated: nullableString(source?.last_updated),
      confidence: confidenceValue(source?.confidence),
      stale: source?.stale === true,
      freshnessHours: nullableNumber(source?.freshness_hours),
    },
    suggestion: suggestion ? {
      id: stringValue(suggestion.id) ?? '',
      eventId: stringValue(suggestion.event_id) ?? '',
      readinessItemId: stringValue(suggestion.readiness_item_id) ?? '',
      proposedPatch: asRecord(suggestion.proposed_patch) ?? {},
      sourceExcerpt: nullableString(suggestion.source_excerpt),
      confidence: nullableNumber(suggestion.confidence),
      baseRowVersion: numberValue(suggestion.base_row_version),
      state: stringValue(suggestion.state) ?? 'unknown',
      reviewActor: nullableString(suggestion.review_actor),
      reviewNote: nullableString(suggestion.review_note),
      createdAt: nullableString(suggestion.created_at),
      reviewedAt: nullableString(suggestion.reviewed_at),
    } : null,
    history: arrayValue(root?.history).map(adaptReadinessSuggestion),
  }
}

function adaptReadinessSuggestion(value: unknown): ReadinessHistoryEntry {
  const suggestion = asRecord(value)
  return {
    id: stringValue(suggestion?.id) ?? '',
    eventId: stringValue(suggestion?.event_id) ?? '',
    readinessItemId: stringValue(suggestion?.readiness_item_id) ?? '',
    proposedPatch: asRecord(suggestion?.proposed_patch) ?? {},
    sourceExcerpt: nullableString(suggestion?.source_excerpt),
    confidence: nullableNumber(suggestion?.confidence),
    baseRowVersion: numberValue(suggestion?.base_row_version),
    state: stringValue(suggestion?.state) ?? 'unknown',
    reviewActor: nullableString(suggestion?.review_actor),
    reviewNote: nullableString(suggestion?.review_note),
    createdAt: nullableString(suggestion?.created_at),
    reviewedAt: nullableString(suggestion?.reviewed_at),
  }
}

export function adaptReadinessItem(value: unknown): ReadinessRow {
  const item = asRecord(value)
  return {
    id: stringValue(item?.id) ?? '',
    job_id: stringValue(item?.job_id) ?? '',
    stage: stringValue(item?.stage) ?? 'unknown',
    step_order: numberValue(item?.step_order),
    lead_time_days: numberValue(item?.lead_time_days),
    planned_day: nullableNumber(item?.planned_day),
    eta_earliest: nullableNumber(item?.eta_earliest),
    eta_latest: nullableNumber(item?.eta_latest),
    confidence: confidenceValue(item?.confidence),
    status: statusValue(item?.status),
    source_type: stringValue(item?.source_type) ?? 'unknown',
    source_reference: nullableString(item?.source_reference),
    last_updated: nullableString(item?.last_updated),
    required_by: numberValue(item?.required_by),
    effective_eta: nullableNumber(item?.effective_eta),
    slack: nullableNumber(item?.slack),
    effective_slack: nullableNumber(item?.effective_slack),
    stale: item?.stale === true,
    freshness_hours: nullableNumber(item?.freshness_hours),
    feasible_for_target: item?.feasible_for_target === true,
    vendor_expedite_required: item?.vendor_expedite_required === true,
    notes: stringArray(item?.notes),
    row_version: numberValue(item?.row_version),
  }
}

function normalizeReadinessError(error: unknown, fallback: string): Error {
  if (error instanceof ApiError) return error
  return error instanceof Error ? error : new Error(fallback)
}

function isReadinessStatus(value: string): value is ReadinessStatus { return value === 'pending' || value === 'ready' || value === 'blocked' || value === 'waived' }
function isReadinessConfidence(value: string): value is ReadinessConfidence { return value === 'low' || value === 'medium' || value === 'high' }
function statusValue(value: unknown): ReadinessStatus { const text = typeof value === 'string' ? value : ''; return isReadinessStatus(text) ? text : 'pending' }
function confidenceValue(value: unknown): ReadinessConfidence { const text = typeof value === 'string' ? value : ''; return isReadinessConfidence(text) ? text : 'medium' }
function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function stringArray(value: unknown): string[] { return arrayValue(value).filter((entry): entry is string => typeof entry === 'string') }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function nullableString(value: unknown): string | null { return stringValue(value) ?? null }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : 0 }
function nullableNumber(value: unknown): number | null { return value === null || value === undefined ? null : numberValue(value) }
