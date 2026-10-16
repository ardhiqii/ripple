import { useQuery } from '@tanstack/react-query'

import { ApiError, apiTransport, createApiTransport } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

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
    queryKey: apiTransport.queryKey('policy', 'workspace'),
    queryFn: () => fetchPolicyData(),
  })
}

async function fetchJson<T>(url: string, init: RequestInit, fetcher: Fetcher): Promise<T> {
  try {
    return await createApiTransport({ fetcher }).get<T>(url, { headers: init.headers })
  } catch (error) {
    if (error instanceof ApiError) throw new PolicyApiError(error.status, error.message || 'Policy data could not be loaded.')
    throw new PolicyApiError(0, error instanceof Error && error.message ? error.message : 'Policy data could not be loaded.')
  }
}
