import { describe, expect, it } from 'vitest'

import {
  clearDemoLocalState,
  describeDemoLocalState,
  demoResetCleanupPlan,
} from './demo-state'

function storage(values: Record<string, string>) {
  return {
    getItem: (key: string) => values[key] ?? null,
    removeItem: (key: string) => { delete values[key] },
    setItem: (key: string, value: string) => { values[key] = value },
  }
}

describe('demo local state helpers', () => {
  it('describes local drafts, comparison state, highlights, and active runs', () => {
    const local = storage({ 'ripple.demo.draft': 'draft', 'ripple.demo.comparison': 'pair' })
    const session = storage({ 'ripple.active-runs': 'run' })

    expect(describeDemoLocalState({ local, session }).filter((item) => item.present).map((item) => item.key)).toEqual([
      'ripple.demo.draft',
      'ripple.demo.comparison',
      'ripple.active-runs',
    ])
  })

  it('clears only known state after a successful reset and preserves cleanup semantics on failure', () => {
    const local = storage({ 'ripple.demo.draft': 'draft', 'ripple.demo.highlights': 'highlight' })
    const session = storage({ 'ripple.active-runs': 'run' })
    const result = clearDemoLocalState({ local, session })

    expect(result.failed).toHaveLength(0)
    expect(result.cleared.map((item) => item.key)).toEqual([
      'ripple.demo.draft',
      'ripple.demo.highlights',
      'ripple.active-runs',
    ])
    expect(describeDemoLocalState({ local, session }).some((item) => item.present)).toBe(false)
    expect(demoResetCleanupPlan.clearQueryCache).toBe(true)
    expect(demoResetCleanupPlan.preserveUiOnFailure).toBe(true)
  })

  it('clears only the selected scenario storage keys when scoped', () => {
    const local = storage({ 'ripple.demo.draft:fleet-scale': 'draft', 'ripple.demo.draft:A-12-base': 'keep' })
    const result = clearDemoLocalState({ local }, 'fleet-scale')

    expect(result.cleared.map((entry) => entry.key)).toEqual(['ripple.demo.draft'])
    expect(local.getItem('ripple.demo.draft:fleet-scale')).toBeNull()
    expect(local.getItem('ripple.demo.draft:A-12-base')).toBe('keep')
  })

  it('removes only active runs belonging to the selected scenario', () => {
    const session = storage({
      'ripple.active-runs': JSON.stringify([
        { runId: 'run-a', eventId: 'event-a', scenarioId: 'A-12-base' },
        { runId: 'run-fleet', eventId: 'event-fleet', scenarioId: 'fleet-scale' },
      ]),
    })

    const result = clearDemoLocalState({ session }, 'A-12-base')

    expect(result.cleared.map((entry) => entry.key)).toEqual(['ripple.active-runs'])
    expect(JSON.parse(session.getItem('ripple.active-runs') ?? '[]')).toEqual([
      { runId: 'run-fleet', eventId: 'event-fleet', scenarioId: 'fleet-scale' },
    ])
  })
})
