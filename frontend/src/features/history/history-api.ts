import { useQuery } from '@tanstack/react-query'

import { ApiError, apiTransport, createApiTransport } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

type DecisionAction = components['schemas']['DecisionAction']
type DecisionDetailResponse = components['schemas']['DecisionDetailResponse']
type DecisionListResponse = components['schemas']['DecisionListResponse']

export type HistoryApiFilters = Readonly<{
  action?: DecisionAction
  planId?: string
  jobId?: string
  actor?: string
  nature?: string
  from?: string
  to?: string
  q?: string
  after?: string
  limit?: number
}>

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class HistoryApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, message: string, code = `http_${status}`) {
    super(message)
    this.name = 'HistoryApiError'
    this.status = status
    this.code = code
  }
}

const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init)

export async function fetchDecisionList(filters: HistoryApiFilters = {}, afterOrFetcher?: string | Fetcher, fetcher: Fetcher = defaultFetcher): Promise<DecisionListResponse> {
  const after = typeof afterOrFetcher === 'string' ? afterOrFetcher : filters.after
  const requestFetcher = typeof afterOrFetcher === 'function' ? afterOrFetcher : fetcher
  const params = historyParams(filters, after)
  try {
    return await createApiTransport({ fetcher: requestFetcher }).get<DecisionListResponse>(`/api/v1/decisions?${params.toString()}`)
  } catch (error) {
    throw toHistoryApiError(error, 'Decision history could not be loaded.')
  }
}

/** Fetch every server cursor page so filters, totals, and the rendered table share one scope. */
export async function fetchAllDecisionPages(filters: HistoryApiFilters = {}, fetcher: Fetcher = defaultFetcher): Promise<DecisionListResponse> {
  const decisions: unknown[] = []
  let after: string | undefined
  let last: DecisionListResponse | undefined
  const cursors = new Set<string>()
  let next: string | undefined
  do {
    if (after && cursors.has(after)) throw new HistoryApiError(502, 'Decision history returned a repeated cursor.', 'cursor_cycle')
    if (after) cursors.add(after)
    last = await fetchDecisionList(filters, after, fetcher)
    const values = Array.isArray(last.decisions) ? last.decisions : []
    decisions.push(...values)
    next = typeof last.next_cursor === 'string' && last.next_cursor ? last.next_cursor : undefined
    after = next
  } while (next)
  return {
    decisions: decisions as DecisionListResponse['decisions'],
    next_cursor: null,
    total_count: last?.total_count ?? decisions.length,
  }
}

export async function fetchDecisionDetail(decisionId: string, fetcher: Fetcher = defaultFetcher): Promise<DecisionDetailResponse> {
  try {
    return await createApiTransport({ fetcher }).get<DecisionDetailResponse>(`/api/v1/decisions/${encodeURIComponent(decisionId)}`)
  } catch (error) {
    throw toHistoryApiError(error, 'Audit detail could not be loaded.')
  }
}

export function useDecisionHistory(filters: HistoryApiFilters = {}) {
  return useQuery({
    queryKey: apiTransport.queryKey('history', 'decisions', filters),
    queryFn: () => fetchDecisionList(filters),
  })
}

export function useDecisionAudit(decisionId?: string) {
  return useQuery({
    queryKey: apiTransport.queryKey('history', 'decision', decisionId),
    queryFn: () => fetchDecisionDetail(decisionId!),
    enabled: Boolean(decisionId),
  })
}

function historyParams(filters: HistoryApiFilters, after?: string): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.planId?.trim()) params.set('plan_id', filters.planId.trim())
  if (filters.jobId?.trim()) params.set('job_id', filters.jobId.trim())
  if (filters.actor?.trim()) params.set('actor', filters.actor.trim())
  if (filters.nature?.trim()) params.set('nature', filters.nature.trim())
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  if (after) params.set('after', after)
  params.set('limit', String(Math.min(Math.max(filters.limit ?? 50, 1), 100)))
  return params
}

function toHistoryApiError(error: unknown, fallbackMessage: string): HistoryApiError {
  if (error instanceof HistoryApiError) return error
  if (error instanceof ApiError) return new HistoryApiError(error.status, error.message || fallbackMessage, error.code)
  return new HistoryApiError(0, error instanceof Error && error.message ? error.message : fallbackMessage)
}
