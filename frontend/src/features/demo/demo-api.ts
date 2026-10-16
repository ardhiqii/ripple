import { useMutation, useQuery } from '@tanstack/react-query'

import { ApiError, apiTransport, createApiTransport } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

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
  try {
    return adaptDemoScenarios(await createApiTransport({ fetcher }).get<DemoScenariosResponse>('/api/v1/demo/scenarios'))
  } catch (error) {
    throw toDemoApiError(error, 'Demo scenarios could not be loaded.')
  }
}

export async function resetDemo(scenarioId: string, fetcher: Fetcher = defaultFetcher): Promise<DemoResetReceipt> {
  const body: DemoResetRequest = { scenario_id: scenarioId }
  const transport = createApiTransport({ fetcher, scenarioId })
  try {
    return adaptDemoResetResponse(await transport.post<DemoResetResponse>('/api/v1/demo/reset', body))
  } catch (error) {
    throw toDemoApiError(error, 'Demo reset could not be completed.')
  }
}

export async function createDemoEvent(rawText: string, fetcher: Fetcher = defaultFetcher): Promise<string> {
  let payload: EventResponse
  try {
    payload = await createApiTransport({ fetcher }).post<EventResponse>('/api/v1/events', { raw_text: rawText, nature: 'disruption' })
  } catch (error) {
    throw toDemoApiError(error, 'Demo event could not be created.')
  }
  const id = payload && typeof payload === 'object' && typeof payload.id === 'string' ? payload.id : undefined
  if (!id) throw new DemoApiError(502, 'Demo event response did not include an event ID.')
  return id
}

export async function createDemoEventAndStartExtraction(rawText: string, scenarioId: string, fetcher: Fetcher = defaultFetcher): Promise<string> {
  const transport = createApiTransport({ fetcher, scenarioId })
  let payload: EventResponse
  try {
    payload = await transport.post<EventResponse>('/api/v1/events', { raw_text: rawText, nature: 'disruption' })
    const id = payload && typeof payload === 'object' && typeof payload.id === 'string' ? payload.id : undefined
    if (!id) throw new DemoApiError(502, 'Demo event response did not include an event ID.')
    await transport.post(`/api/v1/events/${encodeURIComponent(id)}/extract`)
    return id
  } catch (error) {
    throw toDemoApiError(error, 'Demo event extraction could not be started.')
  }
}

export function useDemoScenarios() {
  return useQuery({ queryKey: apiTransport.queryKey('demo', 'scenarios'), queryFn: () => fetchDemoScenarios() })
}

export function useDemoReset() {
  return useMutation({ mutationFn: (scenarioId: string) => resetDemo(scenarioId) })
}

function toDemoApiError(error: unknown, fallbackMessage: string): DemoApiError {
  if (error instanceof ApiError) return new DemoApiError(error.status, error.message || fallbackMessage)
  return new DemoApiError(0, error instanceof Error && error.message ? error.message : fallbackMessage)
}
