import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ActiveRunStatus = 'queued' | 'streaming' | 'completed' | 'failed'

export interface ActiveRun {
  runId: string
  eventId: string
  status: ActiveRunStatus
  startedAt: string
  lastSeq?: number
  scenarioId?: string
}

interface RunRegistryValue {
  activeRuns: ActiveRun[]
  registerRun: (run: ActiveRun) => void
  updateRun: (runId: string, patch: Partial<Pick<ActiveRun, 'status' | 'eventId' | 'lastSeq'>>) => void
  removeRun: (runId: string) => void
  clearRuns: () => void
}

const STORAGE_KEY = 'ripple.active-runs'
const RunRegistryContext = createContext<RunRegistryValue | null>(null)
const fallbackRegistry: RunRegistryValue = {
  activeRuns: [],
  registerRun: () => undefined,
  updateRun: () => undefined,
  removeRun: () => undefined,
  clearRuns: () => undefined,
}

function readStoredRuns(): ActiveRun[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    return value.filter(isActiveRun)
  } catch {
    return []
  }
}

function isActiveRun(value: unknown): value is ActiveRun {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.runId === 'string'
    && typeof candidate.eventId === 'string'
    && typeof candidate.startedAt === 'string'
    && (candidate.lastSeq === undefined || (typeof candidate.lastSeq === 'number' && Number.isInteger(candidate.lastSeq) && candidate.lastSeq >= 0))
    && (candidate.scenarioId === undefined || typeof candidate.scenarioId === 'string')
    && (candidate.status === 'queued' || candidate.status === 'streaming' || candidate.status === 'completed' || candidate.status === 'failed')
}

export function RunRegistryProvider({ children }: { children: ReactNode }) {
  const [activeRuns, setActiveRuns] = useState<ActiveRun[]>(readStoredRuns)

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(activeRuns))
  }, [activeRuns])

  const registerRun = useCallback((run: ActiveRun) => {
    setActiveRuns((current) => [...current.filter((item) => item.runId !== run.runId), run])
  }, [])

  const updateRun = useCallback((runId: string, patch: Partial<Pick<ActiveRun, 'status' | 'eventId' | 'lastSeq'>>) => {
    setActiveRuns((current) => current.map((run) => run.runId === runId ? { ...run, ...patch } : run))
  }, [])

  const removeRun = useCallback((runId: string) => {
    setActiveRuns((current) => current.filter((run) => run.runId !== runId))
  }, [])
  const clearRuns = useCallback(() => setActiveRuns([]), [])

  const value = useMemo(() => ({ activeRuns, registerRun, updateRun, removeRun, clearRuns }), [activeRuns, registerRun, updateRun, removeRun, clearRuns])
  return <RunRegistryContext.Provider value={value}>{children}</RunRegistryContext.Provider>
}

// The provider and its hook intentionally share one context module.
// eslint-disable-next-line react-refresh/only-export-components
export function useRunRegistry() {
  return useContext(RunRegistryContext) ?? fallbackRegistry
}
