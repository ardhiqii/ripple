export const DEMO_LOCAL_STATE = [
  { key: 'ripple.demo.draft', scope: 'local', label: 'demo draft' },
  { key: 'ripple.demo.comparison', scope: 'local', label: 'A-12 comparison selection' },
  { key: 'ripple.demo.highlights', scope: 'local', label: 'one-time highlights' },
  { key: 'ripple.active-runs', scope: 'session', label: 'active run registry' },
] as const

export type DemoLocalStateKey = (typeof DEMO_LOCAL_STATE)[number]['key']
export type DemoStorageScope = (typeof DEMO_LOCAL_STATE)[number]['scope']

export interface DemoStorageLike {
  getItem(key: string): string | null
  removeItem(key: string): void
  setItem?(key: string, value: string): void
}

export interface DemoStorageBundle {
  local?: DemoStorageLike
  session?: DemoStorageLike
}

export interface DemoLocalStateDescription {
  key: DemoLocalStateKey
  scope: DemoStorageScope
  label: string
  present: boolean
}

export interface DemoLocalStateClearResult {
  cleared: readonly DemoLocalStateDescription[]
  failed: readonly DemoLocalStateDescription[]
}

export function scopedDemoStorageKey(key: DemoLocalStateKey, scenarioId: string): string {
  return `${key}:${scenarioId}`
}

export const demoResetCleanupPlan = {
  clearQueryCache: true,
  clearLocalState: DEMO_LOCAL_STATE.map(({ key, scope }) => ({ key, scope })),
  preserveUiOnFailure: true,
} as const

export function describeDemoLocalState(bundle: DemoStorageBundle, scenarioId?: string): DemoLocalStateDescription[] {
  return DEMO_LOCAL_STATE.map((entry) => {
    const storage = entry.scope === 'local' ? bundle.local : bundle.session
    const present = storage
      ? entry.key === 'ripple.active-runs' && scenarioId
        ? hasScenarioRun(storage, scenarioId) || hasValue(storage, scopedDemoStorageKey(entry.key, scenarioId))
        : hasValue(storage, scenarioId ? scopedDemoStorageKey(entry.key, scenarioId) : entry.key)
      : false
    return {
      ...entry,
      present,
    }
  })
}

export function clearDemoLocalState(bundle: DemoStorageBundle, scenarioId?: string): DemoLocalStateClearResult {
  const cleared: DemoLocalStateDescription[] = []
  const failed: DemoLocalStateDescription[] = []

  for (const entry of describeDemoLocalState(bundle, scenarioId)) {
    const storage = entry.scope === 'local' ? bundle.local : bundle.session
    if (!storage || !entry.present) continue
    try {
      if (entry.key === 'ripple.active-runs' && scenarioId && hasScenarioRun(storage, scenarioId)) {
        clearScenarioRuns(storage, scenarioId)
      } else {
        storage.removeItem(scenarioId ? scopedDemoStorageKey(entry.key, scenarioId) : entry.key)
      }
      cleared.push(entry)
    } catch {
      failed.push(entry)
    }
  }

  return { cleared, failed }
}

function hasValue(storage: DemoStorageLike, key: string): boolean {
  try {
    return storage.getItem(key) !== null
  } catch {
    return false
  }
}

function hasScenarioRun(storage: DemoStorageLike, scenarioId: string): boolean {
  try {
    const value: unknown = JSON.parse(storage.getItem('ripple.active-runs') ?? '[]')
    return Array.isArray(value) && value.some((run) => isRunForScenario(run, scenarioId))
  } catch {
    return false
  }
}

function clearScenarioRuns(storage: DemoStorageLike, scenarioId: string): void {
  const setItem = storage.setItem
  if (!setItem) throw new Error('Scenario-scoped active runs cannot be updated in this storage adapter.')
  const value: unknown = JSON.parse(storage.getItem('ripple.active-runs') ?? '[]')
  if (!Array.isArray(value)) throw new Error('Active run registry is not a list.')
  setItem.call(storage, 'ripple.active-runs', JSON.stringify(value.filter((run) => !isRunForScenario(run, scenarioId))))
}

function isRunForScenario(value: unknown, scenarioId: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return (value as { scenarioId?: unknown }).scenarioId === scenarioId
}
