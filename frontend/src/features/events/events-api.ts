import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import type { components } from '@/api/generated/openapi'
import { ApiError, apiTransport } from '@/api/transport'

import {
  eventStateMeta,
  type EventInboxItem,
  type EventLifecycle,
  type EventState,
} from './events-data'

type ChangeEventExtraction = components['schemas']['ChangeEventExtraction']
type EventNature = components['schemas']['EventNature']

export interface EventListFilters {
  nature?: string
  state?: string
  job?: string
  q?: string
}

export interface EventListData {
  items: EventInboxItem[]
  nextCursor: string | null
  totalCount: number
  scenarioLifecycleCounts: Record<string, number>
}

export interface EventDetailData {
  event: EventInboxItem
  extractions: EventExtractionRecord[]
  runs: EventRunRecord[]
  plans: EventPlanRecord[]
}

export interface EventExtractionRecord {
  version: number
  extraction: ChangeEventExtraction
  modelName: string
  promptVersion: string
  confidenceSummary: Record<string, unknown>
  corrected: boolean
  createdAt: string
}

export interface EventRunRecord {
  id: string
  state: string
  attempt: number
  extractionVersion: number
  startedAt: string
  completedAt: string | null
}

export interface EventPlanRecord {
  id: string
  version: number
  verdict: string
  status: string
  baseScheduleVersion: number
  createdAt: string
}

export interface ExtractionStartData {
  eventId: string
  state: EventState
  extractionVersion: number
  status: string
}

export interface RunStartData {
  runId: string
  eventId: string
  state: string
  extractionVersion: number
}

const EVENT_DETAIL_POLL_INTERVAL_MS = 1500
const EVENT_DETAIL_POLL_TIMEOUT_MS = 30_000

const serverStates = new Set<EventState>(['received', 'extracted', 'clarification_needed', 'planning', 'closed'])
const natures = new Set<EventNature>(['request', 'disruption', 'opportunity'])
const serverRunStates = new Set(['queued', 'running', 'completed', 'failed', 'timed_out'])
const serverPlanStatuses = new Set(['proposed', 'approved', 'rejected', 'superseded', 'stale'])

export async function fetchEventList(filters: EventListFilters = {}, after?: string): Promise<EventListData> {
  const params = new URLSearchParams({ limit: '50' })
  if (filters.nature && natures.has(filters.nature as EventNature)) params.set('nature', filters.nature)
  if (filters.state && serverStates.has(filters.state as EventState)) params.set('state', filters.state)
  if (filters.job?.trim()) params.set('job_id', filters.job.trim())
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (after) params.set('after', after)

  try {
    const payload = await apiTransport.get<unknown>(`/api/v1/events?${params.toString()}`)
    return adaptEventList(payload)
  } catch (error) {
    throw normalizeEventError(error, 'Change inbox could not be loaded.')
  }
}

export async function fetchEventDetail(eventId: string): Promise<EventDetailData> {
  try {
    const payload = await apiTransport.get<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}`)
    return adaptEventDetail(payload)
  } catch (error) {
    throw normalizeEventError(error, 'Event detail could not be loaded.')
  }
}

export async function createEvent(rawText: string): Promise<EventInboxItem> {
  const body: components['schemas']['CreateEventRequest'] = { raw_text: rawText }
  try {
    const payload = await apiTransport.post<unknown>('/api/v1/events', body)
    return adaptEventResponse(payload)
  } catch (error) {
    throw normalizeEventError(error, 'Change could not be submitted.')
  }
}

export async function startEventExtraction(eventId: string): Promise<ExtractionStartData> {
  try {
    const payload = await apiTransport.post<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}/extract`)
    const root = asRecord(payload)
    const id = stringValue(root?.event_id)
    const state = eventState(root?.state)
    if (!id || !state) throw new Error('Extraction response did not include a valid event state.')
    return {
      eventId: id,
      state,
      extractionVersion: numberValue(root?.extraction_version),
      status: stringValue(root?.status) ?? 'queued',
    }
  } catch (error) {
    throw normalizeEventError(error, 'Extraction could not be started.')
  }
}

export async function correctEventExtraction(eventId: string, payload: components['schemas']['ExtractionCorrectionRequest']): Promise<EventDetailData> {
  try {
    const response = await apiTransport.patch<unknown>(`/api/v1/events/${encodeURIComponent(eventId)}/extraction`, payload)
    return adaptEventDetail(response)
  } catch (error) {
    throw normalizeEventError(error, 'Extraction correction could not be saved.')
  }
}

export async function startEventRun(eventId: string, options: { retry?: boolean; idempotencyKey?: string } = {}): Promise<RunStartData> {
  try {
    const idempotencyKey = options.idempotencyKey ?? (options.retry ? `ripple-${eventId}-retry` : `ripple-${eventId}`)
    const payload = await apiTransport.post<unknown>(
      `/api/v1/events/${encodeURIComponent(eventId)}/runs`,
      undefined,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    )
    const root = asRecord(payload)
    const runId = stringValue(root?.run_id)
    const returnedEventId = stringValue(root?.event_id)
    if (!runId || !returnedEventId) throw new Error('Run response did not include server IDs.')
    return {
      runId,
      eventId: returnedEventId,
      state: stringValue(root?.state) ?? 'queued',
      extractionVersion: numberValue(root?.extraction_version),
    }
  } catch (error) {
    throw normalizeEventError(error, 'Investigation could not start.')
  }
}

export function useEventList(filters: EventListFilters = {}) {
  return useInfiniteQuery({
    queryKey: apiTransport.queryKey('events', filters),
    queryFn: ({ pageParam }) => fetchEventList(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}

export function useEventDetail(eventId?: string) {
  const [pollingTimedOut, setPollingTimedOut] = useState(false)
  const pollingStartedAt = useRef<number | undefined>(undefined)
  const query = useQuery({
    queryKey: apiTransport.queryKey('events', 'detail', eventId),
    queryFn: () => fetchEventDetail(eventId!),
    enabled: Boolean(eventId),
    refetchInterval: (query) => {
      if (pollingTimedOut) return false
      const event = query.state.data?.event
      if (!event) return false
      return isPollingEvent(event) ? EVENT_DETAIL_POLL_INTERVAL_MS : false
    },
  })

  const event = query.data?.event
  const polling = Boolean(event && isPollingEvent(event))
  useEffect(() => {
    if (!polling) {
      pollingStartedAt.current = undefined
      if (pollingTimedOut) setPollingTimedOut(false)
      return
    }
    if (pollingTimedOut) return
    pollingStartedAt.current ??= Date.now()
    const elapsed = Date.now() - pollingStartedAt.current
    const remaining = Math.max(0, EVENT_DETAIL_POLL_TIMEOUT_MS - elapsed)
    const timeout = window.setTimeout(() => setPollingTimedOut(true), remaining)
    return () => window.clearTimeout(timeout)
  }, [event?.lifecycle, event?.pendingPlan, polling, pollingTimedOut])

  const retryPolling = () => {
    pollingStartedAt.current = Date.now()
    setPollingTimedOut(false)
    void query.refetch()
  }

  return { ...query, pollingTimedOut, retryPolling }
}

function isPollingEvent(item: EventInboxItem): boolean {
  return item.lifecycle === 'extracting' || item.lifecycle === 'running' || item.pendingPlan === true
}

export function adaptEventList(payload: unknown): EventListData {
  const root = asRecord(payload)
  return {
    items: arrayValue(root?.events).map(adaptEventSummary),
    nextCursor: nullableString(root?.next_cursor),
    totalCount: numberValue(root?.total_count),
    scenarioLifecycleCounts: numberRecord(root?.scenario_lifecycle_counts),
  }
}

export function adaptEventDetail(payload: unknown): EventDetailData {
  const root = asRecord(payload)
  const event = adaptEventResponse(root?.event)
  const extractions = arrayValue(root?.extractions)
    .map(adaptExtractionVersion)
    .filter((value): value is EventExtractionRecord => Boolean(value))
  const latestExtraction = [...extractions].sort((left, right) => right.version - left.version)[0]
  const latestRun = latestRecord(root?.runs, 'started_at')
  const latestPlan = latestRecord(root?.plans, 'created_at')
  const latestRunId = nullableString(latestRun?.id)
  const latestRunState = stringValue(latestRun?.state)
  const latestPlanId = nullableString(latestPlan?.id)
  const latestPlanStatus = stringValue(latestPlan?.status)
  const malformedRun = latestRun !== undefined && (latestRunId === null || latestRunState === undefined)
  const malformedPlan = latestPlan !== undefined && (latestPlanId === null || latestPlanStatus === undefined)
  const lifecycle = mapServerLifecycle(
    eventStateFromItem(event),
    latestRunState,
    latestPlanStatus,
    latestRunId,
    latestPlanId,
  )
  return {
    event: enrichEvent(event, malformedRun || malformedPlan ? 'integrity_error' : lifecycle, {
      extraction: latestExtraction?.extraction,
      jobs: stringArray(latestExtraction?.extraction.job_ids),
      latestPlanId,
      latestRunId,
      pendingPlan: latestRunState === 'completed' && latestPlanId === null && latestPlanStatus === undefined,
    }),
    extractions,
    runs: arrayValue(root?.runs).map(adaptRunRecord).filter((value): value is EventRunRecord => Boolean(value)),
    plans: arrayValue(root?.plans).map(adaptPlanRecord).filter((value): value is EventPlanRecord => Boolean(value)),
  }
}

export function mapServerLifecycle(eventStateValue: string | undefined, runState: string | undefined, planStatus: string | undefined, runId?: string | null, planId?: string | null): EventLifecycle {
  if (!serverStates.has(eventStateValue as EventState)) return 'integrity_error'
  if (runState !== undefined && !serverRunStates.has(runState)) return 'integrity_error'
  if (planStatus !== undefined && !serverPlanStatuses.has(planStatus)) return 'integrity_error'
  if (runId !== undefined && ((runId === null) !== (runState === undefined))) return 'integrity_error'
  if (planId !== undefined && ((planId === null) !== (planStatus === undefined))) return 'integrity_error'
  if (planStatus === 'approved') return 'approved'
  if (planStatus === 'rejected') return 'rejected'
  if (planStatus === 'superseded') return 'superseded'
  if (planStatus === 'stale') return 'stale'
  if (planStatus === 'proposed') return 'options_ready'
  if (runState === 'failed' || runState === 'timed_out') return 'failed'
  if (runState === 'queued' || runState === 'running') return 'running'
  if (runState === 'completed') return 'running'
  if (eventStateValue === 'planning') return 'extracting'
  if (eventStateValue === 'clarification_needed') return 'needs_info'
  if (eventStateValue === 'extracted') return 'ready'
  if (eventStateValue === 'received') return 'draft'
  return 'integrity_error'
}

function adaptEventSummary(value: unknown): EventInboxItem {
  const item = asRecord(value)
  const latestRunId = nullableString(item?.latest_run_id)
  const latestRunState = stringValue(item?.latest_run_state)
  const latestPlanId = nullableString(item?.latest_plan_id)
  const latestPlanStatus = stringValue(item?.latest_plan_status)
  return enrichEvent({
    id: requiredString(item?.id, 'Event list item ID'),
    lifecycle: mapServerLifecycle(stringValue(item?.state), latestRunState, latestPlanStatus, latestRunId, latestPlanId),
    nature: natureValue(item?.nature) ?? null,
    cause: nullableString(item?.cause),
    rawTextPreview: stringValue(item?.raw_text_preview) ?? '',
    createdAt: stringValue(item?.created_at) ?? '',
    updatedAt: stringValue(item?.updated_at) ?? '',
    extractionVersion: numberValue(item?.extraction_version),
    jobs: stringArray(item?.job_ids),
    requestedDate: null,
    missingInfo: [],
    sourceSentences: [],
    planId: latestPlanId ?? undefined,
    runId: latestRunId ?? undefined,
    serverState: stringValue(item?.state),
  }, mapServerLifecycle(stringValue(item?.state), latestRunState, latestPlanStatus, latestRunId, latestPlanId), {
    latestPlanId,
    pendingPlan: latestRunState === 'completed' && latestPlanId === null && latestPlanStatus === undefined,
  })
}

function adaptEventResponse(value: unknown): EventInboxItem {
  const item = asRecord(value)
  const state = stringValue(item?.state)
  return {
    id: requiredString(item?.id, 'Event ID'),
    lifecycle: mapServerLifecycle(state, undefined, undefined),
    nature: natureValue(item?.nature) ?? null,
    cause: nullableString(item?.cause),
    rawTextPreview: stringValue(item?.raw_text) ?? '',
    createdAt: stringValue(item?.created_at) ?? '',
    updatedAt: stringValue(item?.updated_at) ?? '',
    extractionVersion: numberValue(item?.extraction_version),
    jobs: [],
    requestedDate: null,
    missingInfo: [],
    sourceSentences: [],
    serverState: state,
  }
}

function enrichEvent(item: EventInboxItem, lifecycle: EventLifecycle, values: { extraction?: ChangeEventExtraction; jobs?: string[]; latestPlanId?: string | null; latestRunId?: string | null; pendingPlan?: boolean }): EventInboxItem {
  const extraction = values.extraction
  return {
    ...item,
    lifecycle,
    nature: natureValue(extraction?.nature) ?? item.nature,
    cause: stringValue(extraction?.cause) ?? item.cause,
    extraction,
    jobs: values.jobs ?? item.jobs,
    requestedDate: numberOrNull(extraction?.requested_start),
    missingInfo: stringArray(extraction?.missing_info),
    sourceSentences: extraction?.source_excerpt ? [extraction.source_excerpt] : item.sourceSentences,
    planId: values.latestPlanId ?? item.planId,
    runId: values.latestRunId ?? item.runId,
    pendingPlan: values.pendingPlan ?? item.pendingPlan,
  }
}

function adaptExtractionVersion(value: unknown): EventExtractionRecord | undefined {
  const row = asRecord(value)
  const extraction = adaptExtraction(row?.extracted_json)
  if (!extraction) return undefined
  return {
    version: numberValue(row?.version),
    extraction,
    modelName: stringValue(row?.model_name) ?? 'Unknown provider',
    promptVersion: stringValue(row?.prompt_version) ?? 'Unknown prompt',
    confidenceSummary: asRecord(row?.confidence_summary) ?? {},
    corrected: row?.corrected === true,
    createdAt: stringValue(row?.created_at) ?? '',
  }
}

function adaptRunRecord(value: unknown): EventRunRecord | undefined {
  const row = asRecord(value)
  const id = stringValue(row?.id)
  const state = stringValue(row?.state)
  const startedAt = stringValue(row?.started_at)
  if (!id || !state || !startedAt) return undefined
  return {
    id,
    state,
    attempt: numberValue(row?.attempt),
    extractionVersion: numberValue(row?.extraction_version),
    startedAt,
    completedAt: nullableString(row?.completed_at),
  }
}

function adaptPlanRecord(value: unknown): EventPlanRecord | undefined {
  const row = asRecord(value)
  const id = stringValue(row?.id)
  const status = stringValue(row?.status)
  if (!id || !status) return undefined
  return {
    id,
    version: numberValue(row?.version),
    verdict: stringValue(row?.verdict) ?? 'Not stated',
    status,
    baseScheduleVersion: numberValue(row?.base_schedule_version),
    createdAt: stringValue(row?.created_at) ?? '',
  }
}

function adaptExtraction(value: unknown): ChangeEventExtraction | undefined {
  const row = asRecord(value)
  const sourceExcerpt = stringValue(row?.source_excerpt)
  if (!sourceExcerpt) return undefined
  return {
    source_excerpt: sourceExcerpt,
    nature: natureValue(row?.nature),
    cause: nullableString(row?.cause) ?? undefined,
    objective: nullableString(row?.objective) ?? undefined,
    requested_start: numberOrUndefined(row?.requested_start),
    job_ids: stringArray(row?.job_ids),
    missing_info: stringArray(row?.missing_info),
    soft_preferences: stringArray(row?.soft_preferences),
    eta_updates: arrayValue(row?.eta_updates).map(adaptEtaUpdate).filter((value): value is components['schemas']['EtaUpdateExtraction'] => Boolean(value)),
    hard_constraints: arrayValue(row?.hard_constraints).map(adaptHardConstraint).filter((value): value is components['schemas']['HardConstraintExtraction'] => Boolean(value)),
    risk_tags: arrayValue(row?.risk_tags).map(adaptRiskTag).filter((value): value is components['schemas']['RiskTagExtraction'] => Boolean(value)),
    levers_ruled_out: arrayValue(row?.levers_ruled_out).map(adaptRuledOutLever).filter((value): value is components['schemas']['RuledOutLeverExtraction'] => Boolean(value)),
  }
}

function adaptEtaUpdate(value: unknown): components['schemas']['EtaUpdateExtraction'] | undefined {
  const row = asRecord(value)
  const jobId = stringValue(row?.job_id)
  const stage = stringValue(row?.stage)
  const sourceExcerpt = stringValue(row?.source_excerpt)
  return jobId && stage && sourceExcerpt ? { job_id: jobId, stage, source_excerpt: sourceExcerpt, eta_earliest: numberOrUndefined(row?.eta_earliest), eta_latest: numberOrUndefined(row?.eta_latest) } : undefined
}

function adaptHardConstraint(value: unknown): components['schemas']['HardConstraintExtraction'] | undefined {
  const row = asRecord(value)
  const kind = stringValue(row?.kind)
  const sourceExcerpt = stringValue(row?.source_excerpt)
  return kind && sourceExcerpt ? { kind, source_excerpt: sourceExcerpt, value: row?.value } : undefined
}

function adaptRiskTag(value: unknown): components['schemas']['RiskTagExtraction'] | undefined {
  const row = asRecord(value)
  const tag = stringValue(row?.tag)
  const sourceExcerpt = stringValue(row?.source_excerpt)
  return tag && sourceExcerpt ? { tag, source_excerpt: sourceExcerpt, object_id: nullableString(row?.object_id) ?? undefined } : undefined
}

function adaptRuledOutLever(value: unknown): components['schemas']['RuledOutLeverExtraction'] | undefined {
  const row = asRecord(value)
  const lever = stringValue(row?.lever)
  const sourceExcerpt = stringValue(row?.source_excerpt)
  return lever && sourceExcerpt ? { lever, source_excerpt: sourceExcerpt } : undefined
}

function latestRecord(value: unknown, dateKey: string): Record<string, unknown> | undefined {
  const rows = arrayValue(value).map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row))
  return rows.sort((left, right) => String(right[dateKey] ?? '').localeCompare(String(left[dateKey] ?? '')))[0]
}

function eventStateFromItem(item: EventInboxItem): string {
  if (item.serverState !== undefined) return item.serverState
  const match = Object.entries(eventStateMeta).find(([, value]) => value.lifecycle === item.lifecycle)
  return match?.[0] ?? 'closed'
}

function eventState(value: unknown): EventState | undefined {
  const text = stringValue(value)
  return text && serverStates.has(text as EventState) ? text as EventState : undefined
}

function natureValue(value: unknown): EventNature | undefined {
  const text = stringValue(value)
  return text && natures.has(text as EventNature) ? text as EventNature : undefined
}

function normalizeEventError(error: unknown, fallback: string): Error {
  if (error instanceof ApiError) return error
  return error instanceof Error && error.message ? error : new Error(fallback)
}

function asRecord(value: unknown): Record<string, unknown> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function arrayValue(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function nullableString(value: unknown): string | null { return stringValue(value) ?? null }
function requiredString(value: unknown, label: string): string { const result = stringValue(value); if (!result) throw new Error(`${label} was missing from the server response.`); return result }
function stringArray(value: unknown): string[] { return arrayValue(value).filter((entry): entry is string => typeof entry === 'string') }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : 0 }
function numberOrNull(value: unknown): number | null { return value === null || value === undefined ? null : numberValue(value) }
function numberOrUndefined(value: unknown): number | undefined { return value === null || value === undefined ? undefined : numberValue(value) }
function numberRecord(value: unknown): Record<string, number> { const row = asRecord(value); return Object.fromEntries(Object.entries(row ?? {}).map(([key, entry]) => [key, numberValue(entry)])) }
