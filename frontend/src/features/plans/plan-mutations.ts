import { useMemo } from 'react'
import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { queryClient as applicationQueryClient } from '@/app/query-client'
import type { components } from '@/api/generated/openapi'
import { apiUrl } from '@/api/url'

type Schemas = components['schemas']

export type ApprovalResponse = Schemas['ApprovalResponse']
export type ApprovePlanRequest = Schemas['ApprovePlanRequest']
export type DecisionMutationResponse = Schemas['DecisionMutationResponse']
export type RejectPlanRequest = Schemas['RejectPlanRequest']
export type ReplyPlanRequest = Schemas['ReplyPlanRequest']

export type PlanMutationAction = 'approve' | 'reject' | 'reply'

type MutationContext = {
  planId: string
  idempotencyKey?: string
  eventId?: string
  jobIds?: readonly string[]
}

export type ApprovePlanInput = MutationContext & {
  option_id: ApprovePlanRequest['option_id']
  expected_schedule_version: ApprovePlanRequest['expected_schedule_version']
  acknowledged_condition_ids?: ApprovePlanRequest['acknowledged_condition_ids']
  required_condition_ids?: readonly string[]
}

export type RejectPlanInput = MutationContext & {
  reason: RejectPlanRequest['reason']
  category?: RejectPlanRequest['category']
  replan?: RejectPlanRequest['replan']
}

export type ReplyPlanInput = MutationContext & {
  context: ReplyPlanRequest['context']
}

export interface ScheduleVersionConflictMetadata {
  expectedVersion?: number
  currentVersion?: number
  changedObjectIds: string[]
}

export class PlanMutationError extends Error {
  readonly action: PlanMutationAction
  readonly status: number
  readonly code: string
  readonly requestId?: string
  readonly retryable: boolean
  readonly details: Record<string, unknown>
  readonly scheduleVersionConflict?: ScheduleVersionConflictMetadata
  readonly conflict?: ScheduleVersionConflictMetadata
  readonly isScheduleVersionConflict: boolean

  constructor({
    action,
    status,
    code,
    message,
    requestId,
    retryable = false,
    details = {},
    scheduleVersionConflict,
  }: {
    action: PlanMutationAction
    status: number
    code: string
    message: string
    requestId?: string
    retryable?: boolean
    details?: Record<string, unknown>
    scheduleVersionConflict?: ScheduleVersionConflictMetadata
  }) {
    super(message)
    this.name = 'PlanMutationError'
    this.action = action
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
    this.details = details
    this.scheduleVersionConflict = scheduleVersionConflict
    this.conflict = scheduleVersionConflict
    this.isScheduleVersionConflict = scheduleVersionConflict !== undefined
  }
}

export type PlanMutationQueryKey = readonly [string, ...unknown[]]

/** The query domains documented for a plan decision write. */
export const planMutationQueryDomains = [
  'schedule',
  'readiness',
  'events',
  'decisions',
  'alerts',
  'jobs',
] as const

export interface PlanMutationInvalidationContext {
  planId: string
  eventId?: string
  jobIds?: readonly string[]
  changedObjectIds?: readonly string[]
}

export function planMutationQueryKeys(context: PlanMutationInvalidationContext): PlanMutationQueryKey[] {
  return [
    ...planMutationQueryDomains.map((domain) => [domain] as PlanMutationQueryKey),
    ['plans', context.planId],
  ]
}

export async function invalidatePlanMutationQueries(
  client: QueryClient,
  context: PlanMutationInvalidationContext,
): Promise<void> {
  await Promise.all(
    planMutationQueryKeys(context).map((queryKey) =>
      client.invalidateQueries({ queryKey, exact: false }),
    ),
  )
}

export interface PlanMutationClientOptions {
  fetcher?: Fetcher
  queryClient?: QueryClient
  createIdempotencyKey?: () => string
}

export interface PlanMutationClient {
  approve(input: ApprovePlanInput): Promise<ApprovalResponse>
  reject(input: RejectPlanInput): Promise<DecisionMutationResponse>
  reply(input: ReplyPlanInput): Promise<DecisionMutationResponse>
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type PlanMutationInput = MutationContext

const defaultCreateIdempotencyKey = () => {
  const randomUUID = globalThis.crypto?.randomUUID
  return randomUUID ? randomUUID() : `ripple-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createPlanMutationClient(options: PlanMutationClientOptions = {}): PlanMutationClient {
  const fetcher: Fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
  const createIdempotencyKey = options.createIdempotencyKey ?? defaultCreateIdempotencyKey
  const inFlight = new Map<string, Promise<ApprovalResponse | DecisionMutationResponse>>()
  const generatedKeys = new Map<string, string>()

  const run = <T extends ApprovalResponse | DecisionMutationResponse>(
    action: PlanMutationAction,
    input: PlanMutationInput,
    payload: object,
    parse: (value: unknown, action: PlanMutationAction) => T,
  ): Promise<T> => {
    const fingerprint = stableSerialize({ action, planId: input.planId, payload })
    const existing = inFlight.get(fingerprint)
    if (existing) return existing as Promise<T>

    const idempotencyKey = input.idempotencyKey?.trim() || generatedKeys.get(fingerprint) || createIdempotencyKey()
    if (!input.idempotencyKey) generatedKeys.set(fingerprint, idempotencyKey)

    const promise = (async () => {
      const response = await fetcher(
        apiUrl(`/api/v1/plans/${encodeURIComponent(input.planId)}/${action}`),
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(payload),
        },
      )
      const value = await readJson(response)
      if (!response.ok) throw parsePlanMutationError(response.status, value, action)

      const result = parse(value, action)
      if (options.queryClient) {
        await invalidatePlanMutationQueries(options.queryClient, {
          planId: input.planId,
          eventId: input.eventId,
          jobIds: input.jobIds,
          changedObjectIds: changedObjectIdsFromResponse(result),
        })
      }
      return result
    })()

    inFlight.set(fingerprint, promise)
    const clear = () => {
      if (inFlight.get(fingerprint) === promise) inFlight.delete(fingerprint)
      if (!input.idempotencyKey) generatedKeys.delete(fingerprint)
    }
    void promise.then(clear, clear)
    return promise as Promise<T>
  }

  return {
    approve(input) {
      try {
        const payload = approvePayload(input)
        return run('approve', input, payload, parseApprovalResponse)
      } catch (error) {
        return Promise.reject(error)
      }
    },
    reject(input) {
      const payload = rejectPayload(input)
      return run('reject', input, payload, parseDecisionMutationResponse)
    },
    reply(input) {
      const payload: ReplyPlanRequest = { context: input.context }
      return run('reply', input, payload, parseDecisionMutationResponse)
    },
  }
}

export function parsePlanMutationError(
  status: number,
  payload: unknown,
  action: PlanMutationAction,
): PlanMutationError {
  const root = asRecord(payload)
  const error = asRecord(root?.error) ?? root
  const details = asRecord(error?.details) ?? {}
  const code = stringValue(error?.code) ?? `http_${status}`
  const expectedVersion = numberValue(details.expected_version) ?? numberValue(details.expected_schedule_version)
  const currentVersion = numberValue(details.current_version) ?? numberValue(details.current_schedule_version)
  const scheduleVersionConflict = status === 409 && (
    code === 'schedule_version_conflict' || expectedVersion !== undefined || currentVersion !== undefined
  )
    ? {
        expectedVersion,
        currentVersion,
        changedObjectIds: stringArray(details.changed_object_ids ?? details.changed_objects),
      }
    : undefined

  return new PlanMutationError({
    action,
    status,
    code,
    message: stringValue(error?.message) ?? stringValue(root?.detail) ?? `Plan ${action} failed with status ${status}.`,
    requestId: stringValue(error?.request_id),
    retryable: error?.retryable === true,
    details,
    scheduleVersionConflict,
  })
}

export function changedObjectIdsFromResponse(
  response: ApprovalResponse | DecisionMutationResponse,
): string[] {
  if (!isRecord(response) || !Array.isArray(response.changed_objects)) return []
  return response.changed_objects.flatMap((item) => {
    const changedObject = asRecord(item)
    const id = stringValue(changedObject?.entity_id)
    return id ? [id] : []
  })
}

const defaultClient = createPlanMutationClient({ queryClient: applicationQueryClient })

export const approvePlan = (input: ApprovePlanInput) => defaultClient.approve(input)
export const rejectPlan = (input: RejectPlanInput) => defaultClient.reject(input)
export const replyToPlan = (input: ReplyPlanInput) => defaultClient.reply(input)

export interface UsePlanMutationsOptions extends PlanMutationClientOptions {
  client?: PlanMutationClient
}

export interface UsePlanMutationsResult {
  approve: UseMutationResult<ApprovalResponse, PlanMutationError, ApprovePlanInput>
  reject: UseMutationResult<DecisionMutationResponse, PlanMutationError, RejectPlanInput>
  reply: UseMutationResult<DecisionMutationResponse, PlanMutationError, ReplyPlanInput>
  client: PlanMutationClient
}

export function usePlanMutations(options: UsePlanMutationsOptions = {}): UsePlanMutationsResult {
  const providerQueryClient = useQueryClient()
  const client = useMemo(
    () => options.client ?? createPlanMutationClient({
      fetcher: options.fetcher,
      queryClient: options.queryClient ?? providerQueryClient,
      createIdempotencyKey: options.createIdempotencyKey,
    }),
    [options.client, options.createIdempotencyKey, options.fetcher, options.queryClient, providerQueryClient],
  )

  const approve = useMutation<ApprovalResponse, PlanMutationError, ApprovePlanInput>({
    mutationFn: (input) => client.approve(input),
  })
  const reject = useMutation<DecisionMutationResponse, PlanMutationError, RejectPlanInput>({
    mutationFn: (input) => client.reject(input),
  })
  const reply = useMutation<DecisionMutationResponse, PlanMutationError, ReplyPlanInput>({
    mutationFn: (input) => client.reply(input),
  })

  return { approve, reject, reply, client }
}

function approvePayload(input: ApprovePlanInput): ApprovePlanRequest {
  const acknowledged = input.acknowledged_condition_ids ?? []
  const required = input.required_condition_ids ?? []
  const acknowledgedSet = new Set(acknowledged)
  const missing = required.filter((conditionId) => !acknowledgedSet.has(conditionId))
  if (missing.length) {
    throw new PlanMutationError({
      action: 'approve',
      status: 422,
      code: 'conditions_not_acknowledged',
      message: 'All required option conditions must be acknowledged.',
      details: { missing_condition_ids: missing },
    })
  }

  return {
    option_id: input.option_id,
    expected_schedule_version: input.expected_schedule_version,
    ...(input.acknowledged_condition_ids === undefined
      ? {}
      : { acknowledged_condition_ids: input.acknowledged_condition_ids }),
  }
}

function rejectPayload(input: RejectPlanInput): RejectPlanRequest {
  return {
    reason: input.reason,
    ...(input.category === undefined ? {} : { category: input.category }),
    ...(input.replan === undefined ? {} : { replan: input.replan }),
  }
}

function parseApprovalResponse(value: unknown, action: PlanMutationAction): ApprovalResponse {
  const response = asRecord(value)
  if (
    !response ||
    !stringValue(response.decision_id) ||
    !stringValue(response.plan_id) ||
    numberValue(response.schedule_version_before) === undefined ||
    numberValue(response.schedule_version_after) === undefined ||
    !Array.isArray(response.changed_objects) ||
    !Array.isArray(response.notification_draft_ids)
  ) {
    throw invalidSuccessResponse(action)
  }
  return value as ApprovalResponse
}

function parseDecisionMutationResponse(value: unknown, action: PlanMutationAction): DecisionMutationResponse {
  const response = asRecord(value)
  if (!response || !stringValue(response.decision_id) || !stringValue(response.plan_id) || response.action !== action) {
    throw invalidSuccessResponse(action)
  }
  return value as DecisionMutationResponse
}

function invalidSuccessResponse(action: PlanMutationAction): PlanMutationError {
  return new PlanMutationError({
    action,
    status: 502,
    code: 'invalid_response',
    message: `Plan ${action} returned an invalid response.`,
  })
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    const object = asRecord(item)
    const id = stringValue(object?.entity_id) ?? stringValue(object?.id)
    return id ? [id] : []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
