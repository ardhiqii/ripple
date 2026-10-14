import { useQuery } from '@tanstack/react-query'

import type { components } from '@/api/generated/openapi'
import { apiUrl } from '@/api/url'

type PolicyDataHealthResponse = components['schemas']['PolicyDataHealthResponse']
type PolicyLeversResponse = components['schemas']['PolicyLeversResponse']
type PolicyProfilesResponse = components['schemas']['PolicyProfilesResponse']

export type PolicyApiData = {
  levers: PolicyLeversResponse
  profiles: PolicyProfilesResponse
  dataHealth: PolicyDataHealthResponse
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init)

export class PolicyApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'PolicyApiError'
    this.status = status
  }
}

export async function fetchPolicyData(fetcher: Fetcher = defaultFetcher): Promise<PolicyApiData> {
  const init = { headers: { Accept: 'application/json' } }
  const [levers, profiles, dataHealth] = await Promise.all([
    fetchJson<PolicyLeversResponse>('/api/v1/policy/levers', init, fetcher),
    fetchJson<PolicyProfilesResponse>('/api/v1/policy/profiles', init, fetcher),
    fetchJson<PolicyDataHealthResponse>('/api/v1/policy/data-health', init, fetcher),
  ])
  return { levers, profiles, dataHealth }
}

export function usePolicyData() {
  return useQuery({
    queryKey: ['policy', 'workspace'],
    queryFn: () => fetchPolicyData(),
  })
}

async function fetchJson<T>(url: string, init: RequestInit, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(apiUrl(url), init)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = undefined
  }
  if (!response.ok) throw new PolicyApiError(response.status, readMessage(payload) ?? 'Policy data could not be loaded.')
  return payload as T
}

function readMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const root = value as Record<string, unknown>
  const error = root.error && typeof root.error === 'object' && !Array.isArray(root.error) ? root.error as Record<string, unknown> : root
  return typeof error.message === 'string' ? error.message : typeof root.detail === 'string' ? root.detail : undefined
}
