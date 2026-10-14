import { useMutation, useQuery } from '@tanstack/react-query'

import type { components } from '@/api/generated/openapi'
import { apiUrl } from '@/api/url'

import { adaptDemoResetResponse, adaptDemoScenarios, type DemoResetReceipt, type DemoScenarioMetadata } from './demo-data'

type DemoResetRequest = components['schemas']['DemoResetRequest']
type DemoResetResponse = components['schemas']['DemoResetResponse']
type DemoScenariosResponse = components['schemas']['DemoScenariosResponse']
type EventResponse = components['schemas']['EventResponse']

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
const defaultFetcher: Fetcher = (input, init) => globalThis.fetch(input, init)

export class DemoApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DemoApiError'
    this.status = status
  }
}

export async function fetchDemoScenarios(fetcher: Fetcher = defaultFetcher): Promise<DemoScenarioMetadata[]> {
  const response = await fetcher(apiUrl('/api/v1/demo/scenarios'), { headers: { Accept: 'application/json' } })
  const payload = await readJson<DemoScenariosResponse>(response)
  if (!response.ok) throw new DemoApiError(response.status, errorMessage(payload) ?? 'Demo scenarios could not be loaded.')
  return adaptDemoScenarios(payload)
}

export async function resetDemo(scenarioId: string, fetcher: Fetcher = defaultFetcher): Promise<DemoResetReceipt> {
  const body: DemoResetRequest = { scenario_id: scenarioId }
  const response = await fetcher(apiUrl('/api/v1/demo/reset'), { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await readJson<DemoResetResponse>(response)
  if (!response.ok) throw new DemoApiError(response.status, errorMessage(payload) ?? 'Demo reset could not be completed.')
  return adaptDemoResetResponse(payload)
}

export async function createDemoEvent(rawText: string, fetcher: Fetcher = defaultFetcher): Promise<string> {
  const response = await fetcher(apiUrl('/api/v1/events'), { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ raw_text: rawText, nature: 'disruption' }) })
  const payload = await readJson<EventResponse>(response)
  if (!response.ok) throw new DemoApiError(response.status, errorMessage(payload) ?? 'Demo event could not be created.')
  const id = payload && typeof payload === 'object' && typeof payload.id === 'string' ? payload.id : undefined
  if (!id) throw new DemoApiError(502, 'Demo event response did not include an event ID.')
  return id
}

export function useDemoScenarios() {
  return useQuery({ queryKey: ['demo', 'scenarios'], queryFn: () => fetchDemoScenarios() })
}

export function useDemoReset() {
  return useMutation({ mutationFn: (scenarioId: string) => resetDemo(scenarioId) })
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T
  } catch {
    return {} as T
  }
}

function errorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const root = value as Record<string, unknown>
  const error = root.error && typeof root.error === 'object' && !Array.isArray(root.error) ? root.error as Record<string, unknown> : root
  return typeof error.message === 'string' ? error.message : typeof root.detail === 'string' ? root.detail : undefined
}
