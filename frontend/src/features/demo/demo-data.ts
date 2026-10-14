import type { components } from '@/api/generated/openapi'

type DemoScenarioResponse = components['schemas']['DemoScenarioResponse']
type DemoScenariosResponse = components['schemas']['DemoScenariosResponse']
type DemoResetResponse = components['schemas']['DemoResetResponse']

export const DEMO_SCENARIO_IDS = {
  base: 'A-12-base',
  constrained: 'A-12-constrained-pair',
} as const

export type DemoScenarioId = (typeof DEMO_SCENARIO_IDS)[keyof typeof DEMO_SCENARIO_IDS]
export type DemoScenarioVariant = 'base' | 'constrained'
export type DemoMode = 'live' | 'recorded' | 'full'

export interface DemoScenarioPreview {
  learningGoal: string
  source: string
  expectedPath: readonly string[]
  resetImpact: string
}

export interface DemoScenarioMetadata {
  id: DemoScenarioId
  backendScenarioId: string
  variant: DemoScenarioVariant
  name: string
  description: string
  message: string
  available: boolean
  mode: DemoMode
  seedVersion: string
  seedChecksum: string | null
  eventId: string
  recordedRunId: string
  preview: DemoScenarioPreview
}

const resetImpact = 'Returns the prototype schedule, readiness, events, plans, and decisions to the offshore-a12-v1 seed.'

export const a12ScenarioFixtures = {
  [DEMO_SCENARIO_IDS.base]: {
    id: DEMO_SCENARIO_IDS.base,
    backendScenarioId: 'A-12-base',
    variant: 'base',
    name: 'A-12 base disruption',
    description: 'Synthetic offshore vendor-delay scenario for the demo.',
    message: "A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it.",
    available: true,
    mode: 'recorded',
    seedVersion: 'offshore-a12-v1',
    seedChecksum: null,
    eventId: '11111111-1111-4111-8111-111111111111',
    recordedRunId: '11111111-1111-4111-8111-111111111101',
    preview: {
      learningGoal: 'See how readiness, capacity, and policy gates produce a conditional recovery plan.',
      source: 'Synthetic production-engineering request about the A-12 vendor delay.',
      expectedPath: [
        'Extract the A-12 request and the fixed B-05 constraint.',
        'Check readiness, capacity, weather, and allowed levers.',
        'Compare verified recovery options.',
        'Review the conditional D+5 recommendation.',
      ],
      resetImpact,
    },
  },
  [DEMO_SCENARIO_IDS.constrained]: {
    id: DEMO_SCENARIO_IDS.constrained,
    backendScenarioId: 'A-12-base',
    variant: 'constrained',
    name: 'A-12 constrained pair',
    description: 'The same seeded schedule with one vendor sentence that closes the expedite lever.',
    message: "A-12 output dropped again, can we move it to this week, D+3 if possible? Don't touch B-05, the client is inspecting it. FYI the vendor says the test bay is full until Thursday.",
    available: true,
    mode: 'recorded',
    seedVersion: 'offshore-a12-v1',
    seedChecksum: null,
    eventId: '22222222-2222-4222-8222-222222222222',
    recordedRunId: '22222222-2222-4222-8222-222222222202',
    preview: {
      learningGoal: 'Compare how one extracted constraint changes the lever path without changing the seeded schedule.',
      source: 'The base request plus the vendor sentence that the test bay is full until Thursday.',
      expectedPath: [
        'Extract the same A-12 request and fixed B-05 constraint.',
        'Rule out expedite_vendor_test from the available lever set.',
        'Try the remaining verified recovery paths.',
        'Explain why no earlier feasible recommendation is available.',
      ],
      resetImpact,
    },
  },
} satisfies Record<DemoScenarioId, DemoScenarioMetadata>

export const demoScenarioFixtures = Object.values(a12ScenarioFixtures)

export function findDemoScenario(id: string): DemoScenarioMetadata | undefined {
  return demoScenarioFixtures.find((scenario) => scenario.id === id)
}

export function adaptDemoScenario(response: DemoScenarioResponse): DemoScenarioMetadata | undefined {
  const scenarioId = stringValue(response.scenario_id)
  if (!scenarioId) return undefined

  const fixture = findDemoScenario(scenarioId)
    ?? (scenarioId === 'A-12-base' ? a12ScenarioFixtures[DEMO_SCENARIO_IDS.base] : undefined)
  if (!fixture) return undefined

  return {
    ...fixture,
    backendScenarioId: scenarioId,
    name: stringValue(response.name) ?? fixture.name,
    description: stringValue(response.description) ?? fixture.description,
    available: booleanValue(response.available, fixture.available),
    mode: modeValue(response.mode, fixture.mode),
    seedVersion: stringValue(response.seed_version) ?? fixture.seedVersion,
    seedChecksum: stringValue(response.seed_checksum) ?? fixture.seedChecksum,
  }
}

export function adaptDemoScenarios(response: DemoScenariosResponse): DemoScenarioMetadata[] {
  const values = arrayValue(response.scenarios)
  return values
    .map((value) => adaptDemoScenario(value as DemoScenarioResponse))
    .filter((scenario): scenario is DemoScenarioMetadata => scenario !== undefined)
}

export interface DemoResetReceipt {
  scenarioId: string
  seedVersion: string
  seedChecksum: string
  scheduleVersion: number
  resetAt: string
}

export function adaptDemoResetResponse(response: DemoResetResponse): DemoResetReceipt {
  return {
    scenarioId: stringValue(response.scenario_id) ?? '',
    seedVersion: stringValue(response.seed_version) ?? '',
    seedChecksum: stringValue(response.seed_checksum) ?? '',
    scheduleVersion: numberValue(response.schedule_version) ?? 0,
    resetAt: stringValue(response.reset_at) ?? '',
  }
}

export type DemoComparisonLayer = 'extraction' | 'lever-set' | 'solver' | 'verdict' | 'recommendation'

export interface DemoComparisonSnapshot {
  extraction: {
    summary: string
    source: string
  }
  leverSet: {
    available: readonly string[]
    ruledOut: readonly string[]
  }
  solver: {
    attempts: readonly string[]
    outcome: string
  }
  verdict: string
  recommendation: string
}

export type DemoComparisonValue = string | readonly string[]

export interface DemoComparisonDiff {
  layer: DemoComparisonLayer
  label: string
  base: DemoComparisonValue
  constrained: DemoComparisonValue
  changed: boolean
}

export interface DemoComparisonFixture {
  baseScenarioId: typeof DEMO_SCENARIO_IDS.base
  constrainedScenarioId: typeof DEMO_SCENARIO_IDS.constrained
  base: DemoComparisonSnapshot
  constrained: DemoComparisonSnapshot
  diffs: readonly DemoComparisonDiff[]
}

export const a12ComparisonBase: DemoComparisonSnapshot = {
  extraction: {
    summary: 'A-12 request targets D+3 while B-05 remains fixed for client inspection.',
    source: a12ScenarioFixtures[DEMO_SCENARIO_IDS.base].message,
  },
  leverSet: {
    available: ['expedite_vendor_test', 'move_cargo'],
    ruledOut: [],
  },
  solver: {
    attempts: ['baseline', 'expedite_vendor_test', 'move_cargo'],
    outcome: 'A verified D+5 path is feasible after moving the D-07 cargo booking.',
  },
  verdict: 'conditional',
  recommendation: 'Move A-12 to D+5 when the vendor confirms the D+2 test slot.',
}

export const a12ComparisonConstrained: DemoComparisonSnapshot = {
  extraction: {
    summary: 'The same A-12 request includes a vendor statement that the test bay is full until Thursday.',
    source: a12ScenarioFixtures[DEMO_SCENARIO_IDS.constrained].message,
  },
  leverSet: {
    available: ['move_cargo', 'swap_locked_window'],
    ruledOut: ['expedite_vendor_test'],
  },
  solver: {
    attempts: ['baseline', 'move_cargo', 'swap_locked_window'],
    outcome: 'No earlier feasible path exists without moving the fixed B-05 job.',
  },
  verdict: 'no_earlier_feasible_option',
  recommendation: 'Keep A-12 at D+9; the faster path would violate the B-05 lock.',
}

export function buildDemoComparisonDiff(
  base: DemoComparisonSnapshot,
  constrained: DemoComparisonSnapshot,
): DemoComparisonDiff[] {
  const values: Array<[DemoComparisonLayer, string, DemoComparisonValue, DemoComparisonValue]> = [
    ['extraction', 'Extraction', base.extraction.summary, constrained.extraction.summary],
    ['lever-set', 'Available lever set', base.leverSet.available, constrained.leverSet.available],
    ['lever-set', 'Ruled-out levers', base.leverSet.ruledOut, constrained.leverSet.ruledOut],
    ['solver', 'Solver attempts', base.solver.attempts, constrained.solver.attempts],
    ['solver', 'Solver outcome', base.solver.outcome, constrained.solver.outcome],
    ['verdict', 'Verdict', base.verdict, constrained.verdict],
    ['recommendation', 'Recommendation', base.recommendation, constrained.recommendation],
  ]

  return values.map(([layer, label, baseValue, constrainedValue]) => ({
    layer,
    label,
    base: baseValue,
    constrained: constrainedValue,
    changed: JSON.stringify(baseValue) !== JSON.stringify(constrainedValue),
  }))
}

export const a12ComparisonFixture: DemoComparisonFixture = {
  baseScenarioId: DEMO_SCENARIO_IDS.base,
  constrainedScenarioId: DEMO_SCENARIO_IDS.constrained,
  base: a12ComparisonBase,
  constrained: a12ComparisonConstrained,
  diffs: buildDemoComparisonDiff(a12ComparisonBase, a12ComparisonConstrained),
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function modeValue(value: unknown, fallback: DemoMode): DemoMode {
  return value === 'live' || value === 'recorded' || value === 'full' ? value : fallback
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
