import { useQuery } from '@tanstack/react-query'

import type { components } from '@/api/generated/openapi'
import { apiUrl } from '@/api/url'

type DecisionAction = components['schemas']['DecisionAction']
type DecisionDetailResponse = components['schemas']['DecisionDetailResponse']
type DecisionListResponse = components['schemas']['DecisionListResponse']

export type HistoryApiFilters = Readonly<{
  action?: DecisionAction
  planId?: string
  after?: string
  limit?: number
}>

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class HistoryApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HistoryApiError'
    this.status = status
  }
}

const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init)

export async function fetchDecisionList(filters: HistoryApiFilters = {}, fetcher: Fetcher = defaultFetcher): Promise<DecisionListResponse> {
  const params = new URLSearchParams()
  if (filters.action) params.set('action', filters.action)
  if (filters.planId) params.set('plan_id', filters.planId)
  if (filters.after) params.set('after', filters.after)
  params.set('limit', String(Math.min(Math.max(filters.limit ?? 100, 1), 100)))
  const query = params.toString()
  const response = await fetcher(apiUrl(`/api/v1/decisions${query ? `?${query}` : ''}`), { headers: { Accept: 'application/json' } })
  return readResponse<DecisionListResponse>(response, 'Decision history could not be loaded.')
}

export async function fetchDecisionDetail(decisionId: string, fetcher: Fetcher = defaultFetcher): Promise<DecisionDetailResponse> {
  const response = await fetcher(apiUrl(`/api/v1/decisions/${encodeURIComponent(decisionId)}`), { headers: { Accept: 'application/json' } })
  return readResponse<DecisionDetailResponse>(response, 'Audit detail could not be loaded.')
}

export function useDecisionHistory(filters: HistoryApiFilters = {}) {
  return useQuery({
    queryKey: ['history', 'decisions', filters],
    queryFn: () => fetchDecisionList(filters),
  })
}

export function useDecisionAudit(decisionId?: string) {
  return useQuery({
    queryKey: ['history', 'decision', decisionId],
    queryFn: () => fetchDecisionDetail(decisionId!),
    enabled: Boolean(decisionId),
  })
}

async function readResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    const message = readMessage(payload) ?? fallbackMessage
    throw new HistoryApiError(response.status, message)
  }
  return payload as T
}

function readMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const root = value as Record<string, unknown>
  const error = root.error && typeof root.error === 'object' && !Array.isArray(root.error) ? root.error as Record<string, unknown> : root
  return typeof error.message === 'string' ? error.message : typeof root.detail === 'string' ? root.detail : undefined
}
