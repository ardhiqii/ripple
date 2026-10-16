import type { components } from '@/api/generated/openapi'

type DecisionAction = components['schemas']['DecisionAction']
type DecisionDetailResponse = components['schemas']['DecisionDetailResponse']
type DecisionListResponse = components['schemas']['DecisionListResponse']
type DecisionSummaryResponse = components['schemas']['DecisionSummaryResponse']

export type HistoryAction = DecisionAction | 'unknown'
export type HistoryConditionalState = 'conditional' | 'unconditional'
export type HistoryAuditKind =
  | 'source_received'
  | 'extraction'
  | 'agent_run'
  | 'plans_proposed'
  | 'reply_or_rejection'
  | 'selected_option'
  | 'approval_revalidation'
  | 'applied_changes'
  | 'notification_drafts'

export type HistoryRecordContext = Readonly<{
  scenarioId?: string
  eventId?: string
  eventNature?: string
  eventCause?: string
  jobs?: readonly string[]
  resources?: readonly string[]
  levers?: readonly string[]
  summary?: string
  planVersion?: number
  runId?: string
  sourceReceivedAt?: string
  extractionAt?: string
  agentRunAt?: string
  planProposedAt?: string
  approvalRevalidatedAt?: string
  appliedAt?: string
  notificationDrafts?: readonly string[]
}>

export type HistoryFilters = Readonly<{
  from?: string
  to?: string
  action?: string
  planId?: string
  nature?: string
  job?: string
  actor?: string
  conditional?: HistoryConditionalState | 'all'
  q?: string
}>

export type HistoryDecision = Readonly<{
  id: string
  planId: string
  selectedOptionId: string | null
  action: HistoryAction
  actor: string
  reason: string | null
  category: string | null
  acknowledgedConditionIds: readonly string[]
  conditionalState: HistoryConditionalState
  scheduleVersionBefore: number | null
  scheduleVersionAfter: number | null
  createdAt: string
  dateLabel: string
  summary: string
  eventId?: string
  eventNature?: string
  eventCause?: string
  jobs: readonly string[]
  resources: readonly string[]
  levers: readonly string[]
  planVersion?: number
  runId?: string
  stableLink: string
}>

export type HistoryChange = Readonly<{
  id: string
  entityType: string
  entityId: string
  field: string
  changeKind: string
  before: Readonly<Record<string, unknown>>
  after: Readonly<Record<string, unknown>>
}>

export type HistoryAuditEvent = Readonly<{
  id: string
  kind: HistoryAuditKind
  label: string
  timestamp: string
  detail: string
  recorded: boolean
}>

export type HistoryAuditDetail = Readonly<{
  decision: HistoryDecision
  changes: readonly HistoryChange[]
  timeline: readonly HistoryAuditEvent[]
}>

export type HistorySummary = Readonly<{
  total: number
  approvals: number
  rejections: number
  replies: number
  conditional: number
}>

export type HistoryViewData = Readonly<{
  decisions: readonly HistoryDecision[]
  details: Readonly<Record<string, HistoryAuditDetail>>
  summary: HistorySummary
  nextCursor: string | null
}>

export function timelineRangeFromDates(from: string, to: string, scenarioStartDate?: string): { from: number; to: number } | undefined {
  if (!scenarioStartDate) return undefined
  const start = Date.parse(`${scenarioStartDate}T00:00:00Z`)
  const fromDate = Date.parse(`${from}T00:00:00Z`)
  const toDate = Date.parse(`${to}T00:00:00Z`)
  if ([start, fromDate, toDate].some(Number.isNaN)) return undefined
  const day = 86_400_000
  const fromDay = Math.max(0, Math.floor((fromDate - start) / day))
  const toDay = Math.max(fromDay, Math.floor((toDate - start) / day))
  return { from: fromDay, to: toDay }
}

const actionLabels: Record<HistoryAction, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  reply: 'Reply / replan',
  unknown: 'Decision',
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function asStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return Object.freeze(value.flatMap((item) => typeof item === 'string' && item.trim() ? [item] : []))
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function decisionAction(value: unknown): HistoryAction {
  return value === 'approve' || value === 'reject' || value === 'reply' ? value : 'unknown'
}

function dateLabel(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(date)
}

function freezeRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value)
}

function freezeObject(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...value })
}

function readRequiredString(value: unknown, field: string): string {
  const result = asString(value)
  if (!result) throw new TypeError(`History decision is missing ${field}.`)
  return result
}

function actionSummary(action: HistoryAction, cause: string | null, jobs: readonly string[]): string {
  const subject = cause ?? (jobs.length ? jobs.join(', ') : 'schedule context')
  return `${actionLabels[action]} · ${subject}`
}

export function humanizeHistoryLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function stableHistoryLink(decisionId: string, scenarioId?: string): string {
  const params = new URLSearchParams({ decision: decisionId })
  if (scenarioId?.trim()) params.set('scenario', scenarioId.trim())
  return `/history?${params.toString()}`
}

export function mapDecisionSummary(response: DecisionSummaryResponse, context: HistoryRecordContext = {}): HistoryDecision {
  const id = readRequiredString(response.id, 'id')
  const planId = readRequiredString(response.plan_id, 'plan_id')
  const action = decisionAction(response.action)
  const acknowledgedConditionIds = asStringList(response.acknowledged_condition_ids)
  const reason = asString(response.reason)
  const createdAt = asString(response.created_at) ?? ''
  const eventCause = context.eventCause ?? asString(response.event_cause)
  const jobs = Object.freeze([...(context.jobs ?? asStringList(response.job_ids))])
  const resources = Object.freeze([...(context.resources ?? [])])
  const record = {
    id,
    planId,
    selectedOptionId: asString(response.selected_option_id),
    action,
    actor: asString(response.actor) ?? 'Unknown actor',
    reason,
    category: asString(response.category),
    acknowledgedConditionIds,
    conditionalState: acknowledgedConditionIds.length ? 'conditional' : 'unconditional',
    scheduleVersionBefore: asNumber(response.schedule_version_before),
    scheduleVersionAfter: asNumber(response.schedule_version_after),
    createdAt,
    dateLabel: dateLabel(createdAt),
    summary: context.summary ?? actionSummary(action, eventCause, jobs),
    ...((context.eventId ?? asString(response.event_id)) ? { eventId: context.eventId ?? asString(response.event_id)! } : {}),
    ...((context.eventNature ?? asString(response.event_nature)) ? { eventNature: context.eventNature ?? asString(response.event_nature)! } : {}),
    ...(eventCause ? { eventCause } : {}),
    jobs,
    resources,
    levers: Object.freeze([...(context.levers ?? [])]),
    ...(context.planVersion === undefined && asNumber(response.plan_version) === null ? {} : { planVersion: context.planVersion ?? asNumber(response.plan_version)! }),
    ...(context.runId ? { runId: context.runId } : {}),
    stableLink: stableHistoryLink(id, context.scenarioId),
  } satisfies HistoryDecision
  return freezeRecord(record)
}

function mapChange(value: unknown, index: number): HistoryChange {
  const source = asRecord(value)
  return freezeRecord({
    id: `${asString(source.entity_type) ?? 'entity'}:${asString(source.entity_id) ?? index}:${asString(source.field) ?? 'change'}`,
    entityType: asString(source.entity_type) ?? 'entity',
    entityId: asString(source.entity_id) ?? 'unknown',
    field: asString(source.field) ?? 'change',
    changeKind: asString(source.change_kind) ?? 'updated',
    before: freezeObject(asRecord(source.before)),
    after: freezeObject(asRecord(source.after)),
  })
}

function event(
  decisionId: string,
  kind: HistoryAuditKind,
  label: string,
  timestamp: string,
  detail: string,
  recorded: boolean,
): HistoryAuditEvent {
  return freezeRecord({ id: `${decisionId}:${kind}`, kind, label, timestamp, detail, recorded })
}

export function mapDecisionDetail(response: DecisionDetailResponse, context: HistoryRecordContext = {}): HistoryAuditDetail {
  const decision = mapDecisionSummary(response, context)
  const changes = Object.freeze((Array.isArray(response.changes) ? response.changes : []).map(mapChange))
  const createdAt = decision.createdAt
  const timeline = [
    event(decision.id, 'source_received', 'Source received', context.sourceReceivedAt ?? createdAt, decision.eventCause ? `${decision.eventCause}${decision.eventId ? ` · Event ${decision.eventId}` : ''}` : decision.eventId ? `Event ${decision.eventId}` : 'Source event reference unavailable', Boolean(decision.eventId)),
    event(decision.id, 'extraction', 'Extraction created or corrected', context.extractionAt ?? createdAt, context.extractionAt ? 'Extraction record captured.' : 'No extraction record in this response.', Boolean(context.extractionAt)),
    event(decision.id, 'agent_run', 'Agent run steps', context.agentRunAt ?? createdAt, decision.runId ? `Investigation run ${decision.runId}` : 'Run reference unavailable in this audit response.', Boolean(decision.runId)),
    event(decision.id, 'plans_proposed', 'Plans proposed', context.planProposedAt ?? createdAt, `Plan ${decision.planId}`, true),
    event(decision.id, 'reply_or_rejection', 'Replies or rejections', createdAt, decision.action === 'reject' ? decision.reason ?? 'Rejected without a reason.' : decision.action === 'reply' ? decision.reason ?? 'Reply recorded.' : 'No reply or rejection recorded.', decision.action === 'reject' || decision.action === 'reply'),
    event(decision.id, 'selected_option', 'Selected option', createdAt, decision.selectedOptionId ? `Option ${decision.selectedOptionId}` : 'No option selected.', Boolean(decision.selectedOptionId)),
    event(decision.id, 'approval_revalidation', 'Approval revalidation', context.approvalRevalidatedAt ?? createdAt, decision.action === 'approve' ? `Schedule v${decision.scheduleVersionBefore ?? '—'} revalidated.` : 'No approval revalidation recorded.', decision.action === 'approve'),
    event(decision.id, 'applied_changes', 'Applied changes', context.appliedAt ?? createdAt, changes.length ? `${changes.length} immutable change record${changes.length === 1 ? '' : 's'}.` : 'No applied change records.', changes.length > 0),
    ...(context.notificationDrafts?.length ? [event(decision.id, 'notification_drafts', 'Notification drafts', createdAt, `${context.notificationDrafts.length} draft${context.notificationDrafts.length === 1 ? '' : 's'} recorded.`, true)] : []),
  ]
  return freezeRecord({ decision, changes, timeline: Object.freeze(timeline) })
}

export function filterHistoryDecisions(decisions: readonly HistoryDecision[], filters: HistoryFilters = {}): readonly HistoryDecision[] {
  const query = filters.q?.trim().toLowerCase()
  const from = filters.from ? Date.parse(filters.from) : Number.NEGATIVE_INFINITY
  const to = filters.to ? Date.parse(filters.to) + 86_399_999 : Number.POSITIVE_INFINITY
  return decisions.filter((decision) => {
    const timestamp = Date.parse(decision.createdAt)
    const searchable = [decision.id, decision.planId, decision.summary, decision.actor, decision.reason, decision.category, decision.eventNature, decision.eventCause, ...decision.jobs, ...decision.resources].filter(Boolean).join(' ').toLowerCase()
    return (Number.isNaN(timestamp) || (timestamp >= from && timestamp <= to))
      && (!filters.action || filters.action === 'all' || decision.action === filters.action)
      && (!filters.planId || decision.planId === filters.planId)
      && (!filters.nature || filters.nature === 'all' || decision.eventNature === filters.nature)
      && (!filters.job || filters.job === 'all' || decision.jobs.includes(filters.job))
      && (!filters.actor || filters.actor === 'all' || decision.actor === filters.actor)
      && (!filters.conditional || filters.conditional === 'all' || decision.conditionalState === filters.conditional)
      && (!query || searchable.includes(query))
  })
}

export function summarizeHistory(decisions: readonly HistoryDecision[]): HistorySummary {
  return freezeRecord({
    total: decisions.length,
    approvals: decisions.filter((decision) => decision.action === 'approve').length,
    rejections: decisions.filter((decision) => decision.action === 'reject').length,
    replies: decisions.filter((decision) => decision.action === 'reply').length,
    conditional: decisions.filter((decision) => decision.conditionalState === 'conditional').length,
  })
}

export function mapHistoryList(
  response: DecisionListResponse,
  contexts: Readonly<Record<string, HistoryRecordContext>> = {},
): readonly HistoryDecision[] {
  const values = Array.isArray(response.decisions) ? response.decisions : []
  return Object.freeze(values.map((value) => {
    const summary = value as DecisionSummaryResponse
    const id = asString(summary.id)
    if (!id) throw new TypeError('History decision list contains a record without an id.')
    return mapDecisionSummary(summary, contexts[id])
  }))
}

export function createHistoryViewData(
  list: DecisionListResponse,
  details: Readonly<Record<string, DecisionDetailResponse>> = {},
  contexts: Readonly<Record<string, HistoryRecordContext>> = {},
  scenarioId?: string,
): HistoryViewData {
  const contextFor = (id: string): HistoryRecordContext => {
    const context = contexts[id] ?? {}
    return scenarioId ? { ...context, scenarioId } : context
  }
  const mappedDetails = Object.fromEntries(Object.entries(details).map(([id, detail]) => [id, mapDecisionDetail(detail, contextFor(id))]))
  const listContexts = Object.fromEntries((Array.isArray(list.decisions) ? list.decisions : []).flatMap((value) => {
    const id = asString(value.id)
    return id ? [[id, contextFor(id)] as const] : []
  }))
  const listedDecisions = mapHistoryList(list, listContexts)
  const listedIds = new Set(listedDecisions.map((decision) => decision.id))
  const decisions = Object.freeze([...listedDecisions, ...Object.values(mappedDetails).map((detail) => detail.decision).filter((decision) => !listedIds.has(decision.id))])
  const summary = summarizeHistory(listedDecisions)
  const serverTotal = asNumber(list.total_count)
  return freezeRecord({
    decisions,
    details: Object.freeze(mappedDetails),
    summary: freezeRecord({ ...summary, total: serverTotal ?? summary.total }),
    nextCursor: asString(list.next_cursor),
  })
}

export function actionLabel(action: HistoryAction): string {
  return actionLabels[action]
}
