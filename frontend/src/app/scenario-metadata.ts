import { useQuery } from '@tanstack/react-query'

import { createApiTransport, DEFAULT_SCENARIO_ID, type ApiFetcher } from '@/api/transport'
import type { components } from '@/api/generated/openapi'

type DemoScenariosResponse = components['schemas']['DemoScenariosResponse']

export const FLEET_SCALE_SCENARIO_ID = 'fleet-scale'

export interface ScenarioOption {
  id: string
  name: string
  description: string
  available: boolean
  mode: string
  seedVersion: string
  seedChecksum: string | null
  scenarioStartDate: string
  resetAllowed: boolean
}

export async function fetchScenarioOptions(fetcher: ApiFetcher = (input, init) => globalThis.fetch(input, init)): Promise<ScenarioOption[]> {
  const payload = await createApiTransport({ scenarioId: DEFAULT_SCENARIO_ID, fetcher }).get<DemoScenariosResponse>('/api/v1/demo/scenarios', { headers: { Accept: 'application/json' } })
  return adaptScenarioOptions(payload)
}

export function adaptScenarioOptions(payload: DemoScenariosResponse): ScenarioOption[] {
  const values = Array.isArray(payload.scenarios) ? payload.scenarios : []
  return values
    .map((value) => adaptScenarioOption(value))
    .filter((value): value is ScenarioOption => value !== undefined && value.available)
}

/**
 * Resolve the UI landing scenario from backend-advertised metadata only.
 * The backend owns whether fleet-scale is available in this environment;
 * the UI must never invent it or fall through to an arbitrary scenario.
 */
export function defaultScenarioOption(options: readonly ScenarioOption[]): ScenarioOption | undefined {
  return options.find((option) => option.id === FLEET_SCALE_SCENARIO_ID)
    ?? options.find((option) => option.id === DEFAULT_SCENARIO_ID)
}

export function useScenarioMetadata() {
  return useQuery({
    queryKey: ['available-scenarios'],
    queryFn: () => fetchScenarioOptions(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

function adaptScenarioOption(value: unknown): ScenarioOption | undefined {
  const record = asRecord(value)
  const id = stringValue(record?.scenario_id)
  if (!id) return undefined
  return {
    id,
    name: stringValue(record?.name) ?? id,
    description: stringValue(record?.description) ?? 'Synthetic planning scenario.',
    available: record?.available === true,
    mode: stringValue(record?.mode) ?? 'live',
    seedVersion: stringValue(record?.seed_version) ?? 'unknown',
    seedChecksum: stringValue(record?.seed_checksum) ?? null,
    scenarioStartDate: stringValue(record?.scenario_start_date) ?? '',
    resetAllowed: record?.reset_allowed === true,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}
