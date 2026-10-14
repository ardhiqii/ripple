import { describe, expect, it } from 'vitest'

import {
  a12ComparisonFixture,
  adaptDemoResetResponse,
  adaptDemoScenario,
  adaptDemoScenarios,
  DEMO_SCENARIO_IDS,
  demoScenarioFixtures,
} from './demo-data'

describe('demo scenario adapters', () => {
  it('keeps only the A-12 base and constrained pair fixtures', () => {
    expect(demoScenarioFixtures.map((scenario) => scenario.id)).toEqual([
      DEMO_SCENARIO_IDS.base,
      DEMO_SCENARIO_IDS.constrained,
    ])
    expect(JSON.stringify(demoScenarioFixtures)).not.toMatch(/E-02|plant/i)
  })

  it('maps generated backend scenario metadata without adding API calls', () => {
    const scenario = adaptDemoScenario({
      scenario_id: 'A-12-base',
      name: 'Backend A-12',
      description: 'Backend description',
      seed_version: 'offshore-a12-v1',
      seed_checksum: 'sha256:seed',
      available: true,
      mode: 'live',
    })

    expect(scenario).toMatchObject({
      id: DEMO_SCENARIO_IDS.base,
      backendScenarioId: 'A-12-base',
      name: 'Backend A-12',
      mode: 'live',
      seedChecksum: 'sha256:seed',
    })
    expect(scenario?.preview.expectedPath.length).toBeGreaterThan(2)
  })

  it('filters unsupported backend scenarios and adapts reset receipts', () => {
    const scenarios = adaptDemoScenarios({
      mode: 'recorded',
      scenarios: [
        {
          scenario_id: 'A-12-base',
          name: 'A-12',
          description: 'base',
          seed_version: 'offshore-a12-v1',
          seed_checksum: 'checksum',
          available: true,
          mode: 'recorded',
        },
        { scenario_id: 'unsupported', name: 'Unsupported' },
      ],
    })
    const receipt = adaptDemoResetResponse({
      scenario_id: 'A-12-base',
      seed_version: 'offshore-a12-v1',
      seed_checksum: 'checksum',
      schedule_version: 1,
      reset_at: '2026-10-13T12:00:00Z',
    })

    expect(scenarios).toHaveLength(1)
    expect(receipt).toEqual({
      scenarioId: 'A-12-base',
      seedVersion: 'offshore-a12-v1',
      seedChecksum: 'checksum',
      scheduleVersion: 1,
      resetAt: '2026-10-13T12:00:00Z',
    })
  })
})

describe('A-12 comparison metadata', () => {
  it('marks extraction, lever set, solver, verdict, and recommendation differences', () => {
    expect(a12ComparisonFixture.diffs.map((diff) => diff.layer)).toEqual([
      'extraction',
      'lever-set',
      'lever-set',
      'solver',
      'solver',
      'verdict',
      'recommendation',
    ])
    expect(a12ComparisonFixture.diffs.every((diff) => diff.changed)).toBe(true)
    expect(a12ComparisonFixture.constrained.leverSet.ruledOut).toContain('expedite_vendor_test')
  })
})
