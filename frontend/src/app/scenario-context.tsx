import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { QueryClient } from '@tanstack/react-query'

import { queryClient as applicationQueryClient, removeScenarioCache } from './query-client'
import {
  ApiError,
  createApiTransport,
  DEFAULT_SCENARIO_ID,
  normalizeScenarioId,
  setActiveScenarioContext,
  type ApiTransport,
} from '@/api/transport'

export interface ScenarioContextValue {
  scenarioId: string
  availableScenarioIds: readonly string[]
  error?: ApiError
  transport: ApiTransport
  selectScenario: (scenarioId: string) => boolean
  clearError: () => void
}

export interface ScenarioProviderProps {
  children: ReactNode
  initialScenarioId?: string
  availableScenarioIds?: readonly string[]
  queryClient?: QueryClient
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null)

export function ScenarioProvider({ children, initialScenarioId, availableScenarioIds = [DEFAULT_SCENARIO_ID], queryClient = applicationQueryClient }: ScenarioProviderProps) {
  const [scenarioId, setScenarioId] = useState(() => normalizeScenarioId(initialScenarioId))
  const [error, setError] = useState<ApiError>()
  const available = useMemo(() => [...new Set(availableScenarioIds.map((id) => normalizeScenarioId(id)))], [availableScenarioIds])
  // Keep non-React API consumers (plain feature functions and SSE helpers) on
  // the same scenario as the router-owned context before child effects run.
  setActiveScenarioContext(scenarioId, available)
  const transport = useMemo(() => createApiTransport({ scenarioId, allowedScenarioIds: available }), [available, scenarioId])

  const selectScenario = useCallback((nextScenarioId: string) => {
    let next: string
    try {
      next = normalizeScenarioId(nextScenarioId)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause : new ApiError({ status: 404, code: 'unknown_scenario', message: 'Unknown scenario.' }))
      return false
    }
    if (!available.includes(next)) {
      setError(new ApiError({ status: 404, code: 'unknown_scenario', message: `Unknown scenario: ${next}.`, details: { scenario_id: next } }))
      return false
    }
    if (next !== scenarioId) removeScenarioCache(queryClient, scenarioId)
    setError(undefined)
    setScenarioId(next)
    return true
  }, [available, queryClient, scenarioId])

  const value = useMemo<ScenarioContextValue>(() => ({
    scenarioId,
    availableScenarioIds: available,
    error,
    transport,
    selectScenario,
    clearError: () => setError(undefined),
  }), [available, error, scenarioId, selectScenario, transport])

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>
}

export function useScenario(): ScenarioContextValue {
  const context = useContext(ScenarioContext)
  if (!context) throw new Error('useScenario must be used within a ScenarioProvider.')
  return context
}

export function useOptionalScenario(): ScenarioContextValue | null {
  return useContext(ScenarioContext)
}
