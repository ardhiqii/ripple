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

export const demoResetCleanupPlan = {
  clearQueryCache: true,
  clearLocalState: DEMO_LOCAL_STATE.map(({ key, scope }) => ({ key, scope })),
  preserveUiOnFailure: true,
} as const

export function describeDemoLocalState(bundle: DemoStorageBundle): DemoLocalStateDescription[] {
  return DEMO_LOCAL_STATE.map((entry) => {
    const storage = entry.scope === 'local' ? bundle.local : bundle.session
    return {
      ...entry,
      present: storage ? hasValue(storage, entry.key) : false,
    }
  })
}

export function clearDemoLocalState(bundle: DemoStorageBundle): DemoLocalStateClearResult {
  const cleared: DemoLocalStateDescription[] = []
  const failed: DemoLocalStateDescription[] = []

  for (const entry of describeDemoLocalState(bundle)) {
    const storage = entry.scope === 'local' ? bundle.local : bundle.session
    if (!storage || !entry.present) continue
    try {
      storage.removeItem(entry.key)
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
